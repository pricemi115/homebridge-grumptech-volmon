/**
 * @description Controls the collection of volume specific information and attributes to be published to homekit.
 * @copyright December 2020
 * @author Mike Price <dev.grumptech@gmail.com>
 * @module VolumeInterrogatorBaseModule
 * @requires debug
 * @see {@link https://github.com/debug-js/debug#readme}
 * @requires events
 * @see {@link https://nodejs.org/dist/latest-v16.x/docs/api/events.html#events}
 * @requires os
 * @see {@link https://nodejs.org/dist/latest-v16.x/docs/api/os.html}
 */

// External dependencies and imports.
import EventEmitter from 'events';
import _debugModule from 'debug';
import _osModule    from 'os';

// Internal dependencies.
// eslint-disable-next-line no-unused-vars
import {VOLUME_TYPES, VolumeData, CONVERSION_BASES} from './volumeData';
import {VolumeWatcher as _volumeWatcher, VOLUME_WATCHER_EVENTS as _VOLUME_WATCHER_EVENTS} from './volumeWatchers';
import {SpawnHelper} from './spawnHelper';

// External dependencies and imports.
/**
 * @description Debugging function pointer for runtime related diagnostics.
 * @private
 */
// eslint-disable-next-line camelcase
const _debug_process    = new _debugModule('vi_process');
/**
 * @description Debugging function pointer for configuration related diagnostics.
 * @private
 */
// eslint-disable-next-line camelcase
const _debug_config     = new _debugModule('vi_config');
/**
 * @description Reference to the operating system functionality.
 * @private
 */
const _os               = new _osModule();

// Bind debug to console.log
// eslint-disable-next-line no-console, camelcase
_debug_process.log = console.log.bind(console);
// eslint-disable-next-line no-console, camelcase
_debug_config.log  = console.log.bind(console);

// Helpful constants and conversion factors.
/**
 * @description Default period, in hours, for checking for changes in mounted volumes.
 * @private
 */
const DEFAULT_PERIOD_HR                 = 6.0;
/**
 * @description Minimum period, in hours, for checking for changes in mounted volumes.
 * @private
 */
const MIN_PERIOD_HR                     = (5.0 / 60.0);     // Once every 5 minutes.
/**
 * @description Maximum period, in hours, for checking for changes in mounted volumes.
 * @private
 */
const MAX_PERIOD_HR                     = (31.0 * 24.0);    // Once per month.
/**
 * @description Factor for converting from hours to milliseconds.
 * @private
 */
const CONVERT_HR_TO_MS                  = (60.0 * 60.0 * 1000.0);
/**
 * @description Flag indicating the identification of an invalid timeout.
 * @private
 */
const INVALID_TIMEOUT_ID                = -1;
/**
 * @description Timeout, in milliseconds, for retrying to detect volume changes.
 * @private
 */
const RETRY_TIMEOUT_MS                  = 250/* milliseconds */;
/**
 * @description Default threshold, in percent, for determining when free space is low.
 * @private
 */
const DEFAULT_LOW_SPACE_THRESHOLD       = 15.0;
/**
 * @description Minimum threshold, in percent, for detecting low free space.
 * @private
 */
const MIN_LOW_SPACE_THRESHOLD           = 0.0;
/**
 * @description Maximum threshold, in percent, for detecting low free space.
 * @private
 */
const MAX_LOW_SPACE_THRESHOLD           = 100.0;
/**
 * @description Maximum time, in milliseconds, for a volume detection to be initiated.
 * @private
 */
const MAX_RETRY_INIT_CHECK_TIME         = 120000;
/**
 * @description Time, in milliseconds, that must have elapsed since starting the operating system before starting volume detection.
 * @private
 */
const MIN_OS_UPTIME_TO_START_MS         = 600000/* milliseconds */;
/**
 * @description Time, in milliseconds, used to rescan for volume changes.
 * @private
 */
const FS_CHANGED_DETECTION_TIMEOUT_MS   = 1000/* milliseconds */;

/**
 * @description Enumeration of the methods for identifying volumes.
 * @private
 * @readonly
 * @enum {string}
 * @property {string} Name- Identify volume by name
 * @property {string} SerialNumber - Identify volume by serial number.
 */
const VOLUME_IDENTIFICATION_METHODS = {
    /* eslint-disable key-spacing */
    Name         : 'name',
    SerialNumber : 'serial_num',
    /* eslint-enable key-spacing */
};

/**
 * @description Enumeration of published events.
 * @readonly
 * @private
 * @enum {string}
 * @property {string} EVENT_SCANNING - Identification for the event published when scanning begins.
 * @property {string} EVENT_READY - Identification for the event published when scanning completes.
 */
const VOLUME_INTERROGATOR_BASE_EVENTS = {
    /* eslint-disable key-spacing */
    EVENT_SCANNING : 'scanning',
    EVENT_READY    : 'ready',
    /* eslint-enable key-spacing */
};

/**
 * @description Scanning initiated notification
 * @event module:VolumeInterrogatorBaseModule#event:scanning
 */
/**
 * @description Volume detection ready notification
 * @event module:VolumeInterrogatorBaseModule#event:ready
 * @type {object}
 * @param {VolumeData} e.results - Flag indicating if the spawned task completed successfully.
 * @param {Buffer} e.result - Buffer of result or error data returned by the spawned process.
 * @param {SpawnHelper} e.source - Reference to the spawn helper that raised the notification.
 */
/**
 * @description Base class for volume interrogation (operating system agnostic).
 * @augments EventEmitter
 */
export class VolumeInterrogatorBase extends EventEmitter {
    /**
     * @description Constructor
     * @class
     * @param {object} [config] - The settings to use for creating the object.
     * @param {number} [config.period_hr] -The time (in hours) for periodically interrogating the system.
     * @param {number} [config.default_alarm_threshold] - The default low space threshold, in percent.
     * @param {object[]} [config.volume_customizations] - Array of objects for per-volume customizations.
     * @param {VOLUME_IDENTIFICATION_METHODS} [config.volume_customizations.volume_id_method] - The method for identifying the volume.
     * @param {string} [config.volume_customizations.volume_name] - The name of the volume (required when `config.volume_customizations.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name`)
     * @param {string} [config.volume_customizations.volume_serial_num] - The serial number of the volume
     *                                                                    (required when `config.volume_customizations.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber`)
     * @param {boolean} [config.volume_customizations.volume_low_space_alarm_active] - The flag indicating if the low space alarm is active or not.
     * @param {number} [config.volume_customizations.volume_alarm_threshold] - The  low space threshold, in percent
     *                                                                         (required when `config.volume_customizations.volume_low_space_alarm_active === true`)
     * @throws {TypeError}  - thrown if the configuration item is not the expected type.
     * @throws {RangeError} - thrown if the configuration parameters are out of bounds.
     */
    constructor(config) {
        let pollingPeriod           = DEFAULT_PERIOD_HR;
        let defaultAlarmThreshold   = DEFAULT_LOW_SPACE_THRESHOLD;
        const volumeCustomizations  = [];
        const exclusionMasks        = [];

        if (config !== undefined) {
            // Polling Period (hours)
            if (Object.prototype.hasOwnProperty.call(config, 'period_hr')) {
                if ((typeof(config.period_hr) === 'number') &&
                    (config.period_hr >= MIN_PERIOD_HR) && (config.period_hr <= MAX_PERIOD_HR)) {
                    pollingPeriod = config.period_hr;
                }
                else if (typeof(config.period_hr) !== 'number') {
                    throw new TypeError(`'config.period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
                }
                else {
                    throw new RangeError(`'config.period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
                }
            }
            // Default Alarm Threshold (percent)
            if (Object.prototype.hasOwnProperty.call(config, 'default_alarm_threshold')) {
                if ((typeof(config.period_hr) === 'number') &&
                    (config.default_alarm_threshold >= MIN_LOW_SPACE_THRESHOLD) &&
                    (config.default_alarm_threshold <= MAX_LOW_SPACE_THRESHOLD)) {
                    defaultAlarmThreshold = config.default_alarm_threshold;
                }
                else if (typeof(config.period_hr) !== 'number') {
                    throw new TypeError(`'config.default_alarm_threshold' must be a number between ${MIN_LOW_SPACE_THRESHOLD} and ${MAX_LOW_SPACE_THRESHOLD}`);
                }
                else {
                    throw new RangeError(`'config.default_alarm_threshold' must be a number between ${MIN_LOW_SPACE_THRESHOLD} and ${MAX_LOW_SPACE_THRESHOLD}`);
                }
            }
            // Exclusion Masks
            if (Object.prototype.hasOwnProperty.call(config, 'exclusion_masks')) {
                if (Array.isArray(config.exclusion_masks)) {
                    for (const mask of config.exclusion_masks) {
                        if (VolumeInterrogatorBase._validateVolumeExclusionMask(mask)) {
                            exclusionMasks.push(mask);
                        }
                        else {
                            throw new TypeError('\'config.volume_customizations\' item is not valid.');
                        }
                    }
                }
                else {
                    throw new TypeError('\'config.volume_customizations\' must be an array.');
                }
            }
            // Enable Volume Customizations
            if (Object.prototype.hasOwnProperty.call(config, 'volume_customizations')) {
                if (Array.isArray(config.volume_customizations)) {
                    for (const item of config.volume_customizations) {
                        if (VolumeInterrogatorBase._validateVolumeCustomization(item)) {
                            volumeCustomizations.push(item);
                        }
                        else {
                            throw new TypeError('\'config.volume_customizations\' item is not valid.');
                        }
                    }
                }
                else {
                    throw new TypeError('\'config.volume_customizations\' must be an array.');
                }
            }
        }

        // Initialize the base class.
        super();

        // Initialize data members.
        this._timeoutID                     = INVALID_TIMEOUT_ID;
        this._deferInitCheckTimeoutID       = INVALID_TIMEOUT_ID;
        this._decoupledStartTimeoutID       = INVALID_TIMEOUT_ID;
        this._checkInProgress               = false;
        this._period_hr                     = DEFAULT_PERIOD_HR;
        this._theVolumes                    = [];
        this._defaultAlarmThreshold         = defaultAlarmThreshold;
        this._volumeCustomizations          = volumeCustomizations;
        this._exclusionMasks                = exclusionMasks;

        // Callbacks bound to this object.
        this._CB__initiateCheck             = this._on_initiateCheck.bind(this);
        this._CB__ResetCheck                = this._on_reset_check.bind(this);
        this._DECOUPLE_Start                = this.Start.bind(this);
        this._CB__VolumeWatcherChange       = this._handleVolumeWatcherChangeDetected.bind(this);
        this._CB__VolumeWatcherAdded        = this._handleVolumeWatcherAdded.bind(this);

        // Set the polling period
        this.Period = pollingPeriod;

        // Get the list of watch folders.
        const watchFolders = this._watchFolders;
        // Compose the configuration for the volume watcher.
        const watcherConfig = [];
        for (const folder of watchFolders) {
            watcherConfig.push({target: folder, recursive: false, ignoreAccess: false});
        }
        // Create volume watchers and register for change notifications.
        this._volWatcher = new _volumeWatcher();
        this._volWatcher.on(_VOLUME_WATCHER_EVENTS.EVENT_CHANGE_DETECTED,  this._CB__VolumeWatcherChange);
        this._volWatcher.on(_VOLUME_WATCHER_EVENTS.EVENT_WATCH_ADD_RESULT, this._CB__VolumeWatcherAdded);
        // Add watches for the locations of interest.
        // Note: This is asynchronous and will be happening after the constructor completes.
        // eslint-disable-next-line new-cap
        this._volWatcher.AddWatches(watcherConfig);
    }

    /**
     * @description Destructor
     * @returns {void}
     */
    Terminate() {
        // eslint-disable-next-line new-cap
        this.Stop();

        // Cleanup the volume watcher
        // eslint-disable-next-line new-cap
        this._volWatcher.Terminate();

        this.removeAllListeners(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_SCANNING);
        this.removeAllListeners(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY);
    }

    /**
     * @description Read Property accessor for the interrogation period.
     * @returns {number} - Time, in hours, for interrogating for changes.
     */
    get Period() {
        return this._period_hr;
    }

    /**
     * @description Write Property accessor for the interrogation period.
     * @param {number} periodHR - Time, in hours, for interrogating for changes.
     * @throws {TypeError}  - thrown if 'periodHR' is not a number.
     * @throws {RangeError} - thrown if 'periodHR' outside the allowed bounds.
     */
    set Period(periodHR) {
        if ((periodHR === undefined) || (typeof(periodHR) !== 'number')) {
            throw new TypeError(`'period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
        }
        if ((periodHR < MIN_PERIOD_HR) && (periodHR > MAX_PERIOD_HR)) {
            throw new RangeError(`'period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
        }

        // Update the polling period
        this._period_hr = periodHR;

        // Manage the timeout
        // eslint-disable-next-line new-cap
        this.Stop();
    }

    /**
     * @description Read-Only Property accessor for the minumum period
     * @returns {number} - Time, in hours, for minimum value of the interrogation period
     */
    get MinimumPeriod() {
        return MIN_PERIOD_HR;
    }

    /**
     * @description Read-Only Property accessor for the maximum period
     * @returns {number} - Time, in hours, for maximum value of the interrogation period
     */
    get MaximumPeriod() {
        return MAX_PERIOD_HR;
    }

    /**
     * @description Read-Only Property accessor indicating if the checking of volume data is active.
     * @returns {boolean} - true if active.
     */
    get Active() {
        return (this._timeoutID !== INVALID_TIMEOUT_ID);
    }

    /**
     * @description Starts/Restart the interrogation process.
     * @returns {void}
     */
    Start() {
        // Clear the decoupled start timer, if active.
        if (this._decoupledStartTimeoutID !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._decoupledStartTimeoutID);
        }

        // Stop the interrogation in case it is running.
        // eslint-disable-next-line new-cap
        this.Stop();

        // Get the current uptime of the operating system
        const uptime = _os.uptime() * 1000.0;
        // Has the operating system been running long enough?
        if (uptime < MIN_OS_UPTIME_TO_START_MS) {
            // No. So defer the start for a bit.
            this._decoupledStartTimeoutID = setTimeout(this._DECOUPLE_Start, (MIN_OS_UPTIME_TO_START_MS - uptime));
        }
        else {
            // Perform a check now.
            this._on_initiateCheck();
        }
    }

    /**
     * @description Stop the interrogation process, if running.
     * @returns {void}
     */
    Stop() {
        if (this._timeoutID !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._timeoutID);
            this._timeoutID = INVALID_TIMEOUT_ID;
        }
    }

    /**
     * @description Helper function used to reset an ongoing check.
     * @summary Used to recover from unexpected errors.
     * @param {boolean} issueReady - Flag indicating if a Ready event should be emitted.
     * @returns {void}
     * @private
     */
    _on_reset_check(issueReady) {
        if ((issueReady === undefined) || (typeof(issueReady) !== 'boolean')) {
            throw new TypeError('issueReadyEvent is not a boolean.');
        }

        // Mark that the check is no longer in progress.
        this._checkInProgress = false;

        // Reset the timer id, now that it has tripped.
        this._deferInitCheckTimeoutID = INVALID_TIMEOUT_ID;

        // Clear the previously known volune data.
        this._theVolumes = [];

        // Perform operating system specific reset actions.
        this._doReset();

        if (this._decoupledStartTimeoutID !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._decoupledStartTimeoutID);
            this._decoupledStartTimeoutID = INVALID_TIMEOUT_ID;
        }

        if (issueReady) {
            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY, {results: []});
        }
    }

    /**
     * @description Helper function used to initiate an interrogation of the system volumes.
     * @summary Called periodically by a timeout timer.
     * @returns {void}
     * @private
     */
    _on_initiateCheck() {
        // Is there a current volume check underway?
        const isPriorCheckInProgress = this._checkInProgress;

        _debug_process(`_on_initiateCheck(): Initiating a scan. CheckInProgress=${isPriorCheckInProgress}`);

        if (!this._checkInProgress) {
            // Alert interested clients that the scan was initiated.
            this.emit(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_SCANNING);

            // Mark that the check is in progress.
            this._checkInProgress = true;

            // Clear the previously known volune data.
            this._theVolumes = [];

            // Perform operating system specific reset actions.
            this._doReset();

            // Let the interrogation begin.
            this._initiateInterrogation();
        }
        else if (this._deferInitCheckTimeoutID === INVALID_TIMEOUT_ID) {
            this._deferInitCheckTimeoutID = setTimeout(this._CB__ResetCheck, MAX_RETRY_INIT_CHECK_TIME, true);
        }

        // Compute the number of milliseconds for the timeout.
        // Note: If there was a check in progress when we got here, try again in a little bit,
        //       do not wait for the full timeout.
        const theDelay = (isPriorCheckInProgress ? RETRY_TIMEOUT_MS : (this._period_hr * CONVERT_HR_TO_MS));
        // Queue another check
        this._timeoutID = setTimeout(this._CB__initiateCheck, theDelay);
    }

    /**
     * @description Abstract method used to initiate interrogation on derived classes.
     * @returns {void}
     * @private
     * @throws {Error} - Always thrown. Should only be invoked on derived classes.
     */
    _initiateInterrogation() {
        throw new Error('Abstract Method _initiateInterrogation() invoked!');
    }

    /**
     * @description Abstract method used to reset an interrogation.
     * @returns {void}
     * @private
     * @throws {Error} - Always thrown. Should only be invoked on derived classes.
     */
    _doReset() {
        throw new Error('Abstract Method _doReset() invoked!');
    }

    /**
     * @description Abstract property used to determine if a check is in progress.
     * @returns {void}
     * @private
     * @throws {Error} - Always thrown. Should only be invoked on derived classes.
     */
    get _isCheckInProgress() {
        throw new Error('Abstract Property _checkInProgress() invoked!');
    }

    /**
     * @description Abstract property used to get an array of watch folders used to initiate an interrogation.
     * @returns {void}
     * @private
     * @throws {Error} - Always thrown. Should only be invoked on derived classes.
     */
    get _watchFolders() {
        throw new Error('Abstract Property _watchFolders() invoked!');
    }

    /**
     * @description Helper for managing the "in progress" flag and 'ready' event
     * @returns {void}
     * @private
     */
    _updateCheckInProgress() {
        const wasCheckInProgress = this._checkInProgress;
        this._checkInProgress = this._isCheckInProgress;
        if (wasCheckInProgress && !this._checkInProgress) {
            // Fire Ready event
            this.emit(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY, {results: this._theVolumes});

            _debug_process('Ready event.');
            for (const volume of this._theVolumes) {
                _debug_process(`Volume Name: ${volume.Name}`);
                _debug_process(`\tVisible:    ${volume.IsVisible}`);
                _debug_process(`\tShown:      ${volume.IsShown}`);
                _debug_process(`\tMountPoint: ${volume.MountPoint}`);
                _debug_process(`\tDevNode:    ${volume.DeviceNode}`);
                // eslint-disable-next-line new-cap
                _debug_process(`\tCapacity:   ${VolumeData.ConvertFromBytesToGB(volume.Size).toFixed(4)} GB`);
                // eslint-disable-next-line new-cap
                _debug_process(`\tFree:       ${VolumeData.ConvertFromBytesToGB(volume.FreeSpace).toFixed(4)} GB`);
                // eslint-disable-next-line new-cap
                _debug_process(`\tUsed:       ${VolumeData.ConvertFromBytesToGB(volume.UsedSpace).toFixed(4)} GB`);
                _debug_process(`\t% Used:     ${((volume.UsedSpace / volume.Size) * 100.0).toFixed(2)}%`);
            }
        }
    }

    /**
     * @description Helper to compute the alert for a specific volume.
     * @param {string} volumeName - Name of the volume
     * @param {string} volumeUUID - Unique Identifier (serial number) of the volume
     * @param {number} volumePercentFree - Percentage of free space (0...100)
     * @returns {boolean} true if the alert is active
     * @private
     * @throws {TypeError} - thrown for invalid arguments
     * @throws {RangeError} - thrown when 'volumePercentFree' is outside the range of 0...100
     */
    _determineLowSpaceAlert(volumeName, volumeUUID, volumePercentFree) {
        // Validate arguments
        if ((volumeName === undefined) || (typeof(volumeName) !== 'string') || (volumeName.length <= 0)) {
            throw new TypeError('\'volumeName\' must be a non-zero length string');
        }
        if ((volumeUUID === undefined) || (typeof(volumeUUID) !== 'string') || (volumeUUID.length <= 0)) {
            throw new TypeError('\'volumeUUID\' must be a non-zero length string');
        }
        if ((volumePercentFree === undefined) || (typeof(volumePercentFree) !== 'number')) {
            throw new TypeError('\'volumePercentFree\' must be a number');
        }
        else if ((volumePercentFree < MIN_LOW_SPACE_THRESHOLD) || (volumePercentFree > MAX_LOW_SPACE_THRESHOLD)) {
            throw new RangeError(`'volumePercentFree' must be in the range of ${MIN_LOW_SPACE_THRESHOLD}...${MAX_LOW_SPACE_THRESHOLD}. ${volumePercentFree}`);
        }

        // Determine the default alert state.
        let alert = (volumePercentFree < this._defaultAlarmThreshold);

        // Does this volume have a customization?
        const volCustomizations = this._volumeCustomizations.filter((item) => {
            const match = (((item.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name) &&
                             (item.volume_name.toLowerCase() === volumeName.toLowerCase())) ||
                            ((item.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber) &&
                             (item.volume_serial_num.toLowerCase() === volumeUUID.toLowerCase())));
            return match;
        });
        if ((volCustomizations !== undefined) && (volCustomizations.length > 0)) {
            // There is at least one customization.

            // Filter for the matching customizations that indicate an alert.
            const trippedAlerts = volCustomizations.filter((item) => {
                const alertTripped = ((item.volume_low_space_alarm_active) &&
                                      (volumePercentFree < item.volume_alarm_threshold));

                return alertTripped;
            });

            // If any alerts were set, then indicate that.
            alert = (trippedAlerts.length > 0);
        }

        return alert;
    }

    /**
     * @description Event handler for file system change detections.
     *              Called when the contents of the watched folder(s) change(s).
     * @param {*} eventType - Type of change detected ('rename' or 'change')
     * @param {*} fileName - Name of the file or directory with the change.
     * @private
     * @returns {void}
     */
    _handleVolumeWatcherChangeDetected(eventType, fileName) {
        // Decouple the automatic refresh.
        setImmediate((eType, fName) => {
            _debug_process(`Volume Watcher Change Detected: type:${eType} name:${fName} active:${this.Active} chkInProgress:${this._checkInProgress}`);
            // Initiate a re-scan (decoupled from the notification event), if active (even if there
            // is a scan already in progress.)
            if (this.Active) {
                if (this._decoupledStartTimeoutID !== INVALID_TIMEOUT_ID) {
                    clearTimeout(this._decoupledStartTimeoutID);
                }
                this._decoupledStartTimeoutID = setTimeout(this._DECOUPLE_Start, FS_CHANGED_DETECTION_TIMEOUT_MS);
            }
        }, eventType, fileName);
    }

    // eslint-disable-next-line class-methods-use-this
    /**
     * @description Event handler for file system change detections.
     *              Called when the contents of the watched folder(s) change(s).
     * @param {object} result - Result of the request to add a watcher.
     * @param {string} result.target - Target of the watch
     * @param {boolean} result.success - Status of the add operation.
     * @returns {void}
     */
    _handleVolumeWatcherAdded(result) {
        if (result !== undefined) {
            _debug_process(`AddWatch Results: target:${result.target} status:${result.success}`);
        }
    }

    /**
     * @description Helper to determine if the volume should be shown or not.
     * @param {string} mountPoint - Mount Point of the volume
     * @returns {boolean} - true if shown. false otherwise.
     * @throws { TypeError } - thrown if mountPoint is not a non-null string.
     * @private
     */
    _isVolumeShown(mountPoint) {
        if ((mountPoint === undefined) ||
            (typeof(mountPoint) !== 'string') || (mountPoint.length <= 0)) {
            throw new TypeError(`_isVolumeShown. mountPoint is not valid. ${mountPoint}`);
        }

        let isShown = true;
        for (const mask of this._exclusionMasks) {
            _debug_process(`Evaluating exclusion mask '${mask}' for mount point '${mountPoint}'`);
            const reMask = new RegExp(mask);
            const matches = mountPoint.match(reMask);
            _debug_process(matches);
            isShown = isShown && (matches === null);
        }

        return isShown;
    }

    /**
     * @description Helper to evaluate the validity of the custom configuration settings.
     * @param {object} customConfig - Custom per-volume configuration settings.
     * @param {string} customConfig.volume_id_method - The method for identifying the volume.
     * @param {string} customConfig.volume_name - The name of the volume.
     *                                      (required when `config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name`)
     * @param {string} customConfig.volume_serial_num - The serial number of the volume.
     *                                            (required when `config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber`)
     * @param {boolean} customConfig.volume_low_space_alarm_active - The flag indicating if the low space alarm is active or not.
     * @param {number} customConfig.volume_alarm_threshold - The low space threshold, in percent.
     *                                                 (required when `config.volume_low_space_alarm_active === true`)
     * @returns {boolean} `true` if the configuration is valid. `false` otherwise.
     * @private
     */
    static _validateVolumeCustomization(customConfig) {
        // Initial sanoty check.
        let valid = (customConfig !== undefined);

        if (valid) {
            // Volume Id Method
            if ((!Object.prototype.hasOwnProperty.call(customConfig, 'volume_id_method')) ||
                (typeof(customConfig.volume_id_method) !== 'string')                      ||
                (Object.values(VOLUME_IDENTIFICATION_METHODS).indexOf(customConfig.volume_id_method) < 0)) {
                valid = false;
            }
            // Volume Name
            if (valid &&
                (customConfig.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name) &&
                ((!Object.prototype.hasOwnProperty.call(customConfig, 'volume_name')) ||
                 (typeof(customConfig.volume_name) !== 'string')                      ||
                 (customConfig.volume_name.length <= 0))) {
                valid = false;
            }
            // Volume Serial Number
            if (valid &&
                (customConfig.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber) &&
                ((!Object.prototype.hasOwnProperty.call(customConfig, 'volume_serial_num')) ||
                 (typeof(customConfig.volume_serial_num) !== 'string')                      ||
                 (customConfig.volume_serial_num.length <= 0))) {
                valid = false;
            }
            // Low Space Alarm Active
            if ((!Object.prototype.hasOwnProperty.call(customConfig, 'volume_low_space_alarm_active')) ||
                (typeof(customConfig.volume_low_space_alarm_active) !== 'boolean')) {
                valid = false;
            }
            // Low Space Alarm Threshold
            if (valid &&
                customConfig.volume_low_space_alarm_active &&
                ((!Object.prototype.hasOwnProperty.call(customConfig, 'volume_alarm_threshold')) ||
                 (typeof(customConfig.volume_alarm_threshold) !== 'number')                      ||
                 (customConfig.volume_alarm_threshold <= MIN_LOW_SPACE_THRESHOLD)                ||
                 (customConfig.volume_alarm_threshold >= MAX_LOW_SPACE_THRESHOLD))) {
                valid = false;
            }
        }

        return valid;
    }

    /**
     * @description Helper to evaluate the validity of the volume exclusion configuration.
     * @param {object} maskConfig - Volume exclusion mask.
     * @returns {boolean} - `true` if the exclusion mask is valid. `false` otherwise.
     */
    static _validateVolumeExclusionMask(maskConfig) {
        let valid = (maskConfig !== undefined);

        if (valid) {
            valid = (typeof(maskConfig) === 'string');
        }
        return valid;
    }
}
export default VolumeInterrogatorBase;
