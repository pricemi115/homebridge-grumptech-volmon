/* ==========================================================================
   File:               volumeInterrogatorBase.js
   Class:              Volume Interrogator Base Class
   Description:	       Controls the collection of volume specific information
                       and attributes to be published to homekit.
   Copyright:          Dec 2020
   ========================================================================== */
'use strict';

// External dependencies and imports.
const _debug_process    = require('debug')('vi_process');
const _debug_config     = require('debug')('vi_config');
const _os               = require('os');
import EventEmitter       from 'events';

// Internal dependencies.
// eslint-disable-next-line no-unused-vars
import { VOLUME_TYPES, VolumeData, CONVERSION_BASES } from './volumeData.js';
import { VolumeWatcher as _volumeWatcher, VOLUME_CHANGE_DETECTION_EVENTS as _VOLUME_CHANGE_DETECTION_EVENTS} from './volumeWatchers.js';

// Bind debug to console.log
_debug_process.log = console.log.bind(console);
_debug_config.log  = console.log.bind(console);

// Helpful constants and conversion factors.
const DEFAULT_PERIOD_HR                 = 6.0;
const MIN_PERIOD_HR                     = (5.0 / 60.0);     // Once every 5 minutes.
const MAX_PERIOD_HR                     = (31.0 * 24.0);    // Once per month.
const CONVERT_HR_TO_MS                  = (60.0 * 60.0 * 1000.0);
const INVALID_TIMEOUT_ID                = -1;
const RETRY_TIMEOUT_MS                  = 250 /* milliseconds */;
const DEFAULT_LOW_SPACE_THRESHOLD       = 15.0;
const MIN_LOW_SPACE_THRESHOLD           = 0.0;
const MAX_LOW_SPACE_THRESHOLD           = 100.0;
const MAX_RETRY_INIT_CHECK_Time         = 120000;
const MIN_OS_UPTIME_TO_START_MS         = 600000; /* 10 minutes */
const FS_CHANGED_DETECTION_TIMEOUT_MS   = 1000 /*milliseconds */

// Volume Identification Methods
const VOLUME_IDENTIFICATION_METHODS = {
    Name: 'name',
    SerialNumber: 'serial_num'
};

// Published events
const VOLUME_INTERROGATOR_BASE_EVENTS = {
    EVENT_SCANNING: 'scanning',
    EVENT_READY:    'ready'
}

/* ==========================================================================
   Class:              VolumeInterrogator
   Description:	       Manager for interrogating volumes on the system
   Copyright:          Dec 2020

   @event 'ready' => function({object})
   @event_param {<VolumeData>}  [results]  - Array of volume data results.
   Event emmitted when the (periodic) interrogation is completes.

   @event 'scanning' => function({object})
   Event emmitted when a refresh/rescan is initiated.
   ========================================================================== */
export class VolumeInterrogatorBase extends EventEmitter {
 /* ========================================================================
    Description:    Constructor

    @param {object}     [config]                         - The settings to use for creating the object.
    @param {number}     [config.period_hr]               - The time (in hours) for periodically interrogating the system.
    @param {number}     [config.default_alarm_threshold] - The default low space threshold, in percent.
    @param { [object] } [config.volume_customizations]   - Array of objects for per-volume customizations.

    @return {object}  - Instance of the VolumeInterrogator class.

    @throws {TypeError}  - thrown if the configuration parameters are not the correct type.
    @throws {RangeError} - thrown if the configuration parameters are out of bounds.
    ======================================================================== */
    constructor(config) {

        let polling_period          = DEFAULT_PERIOD_HR;
        let defaultAlarmThreshold   = DEFAULT_LOW_SPACE_THRESHOLD;
        let volumeCustomizations    = [];
        let exclusionMasks          = [];

        if (config !== undefined) {
            // Polling Period (hours)
            if (Object.prototype.hasOwnProperty.call(config, 'period_hr')) {
                if ((typeof(config.period_hr)==='number') &&
                    (config.period_hr >= MIN_PERIOD_HR) && (config.period_hr <= MAX_PERIOD_HR)) {
                    polling_period = config.period_hr;
                }
                else if (typeof(config.period_hr)!=='number') {
                    throw new TypeError(`'config.period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
                }
                else {
                    throw new RangeError(`'config.period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
                }
            }
            // Default Alarm Threshold (percent)
            if (Object.prototype.hasOwnProperty.call(config, 'default_alarm_threshold')) {
                if ((typeof(config.period_hr)==='number') &&
                    (config.default_alarm_threshold >= MIN_LOW_SPACE_THRESHOLD) && (config.default_alarm_threshold <= MAX_LOW_SPACE_THRESHOLD)) {
                        defaultAlarmThreshold = config.default_alarm_threshold;
                }
                else if (typeof(config.period_hr)!=='number') {
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
                            throw new TypeError(`'config.volume_customizations' item is not valid.`);
                        }
                    }
                }
                else {
                    throw new TypeError(`'config.volume_customizations' must be an array.`);
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
                            throw new TypeError(`'config.volume_customizations' item is not valid.`);
                        }
                    }
                }
                else {
                    throw new TypeError(`'config.volume_customizations' must be an array.`);
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

        // Set the polling period
        this.Period = polling_period;

         // Get the list of watch folders.
        const watchFolders = this._watchFolders;
        // Compose the configuration for the volume watcher.
        const watcherConfig = [];
        for (const folder of watchFolders)
        {
            watcherConfig.push( {target:folder, recursive:false, ignoreAccess:false} );
        }
       // Create volume watchers and register for change notifications.
       this._volWatcher = new _volumeWatcher( {watch_list:watcherConfig} );
       this._volWatcher.on(_VOLUME_CHANGE_DETECTION_EVENTS.EVENT_CHANGE_DETECTED, this._CB__VolumeWatcherChange);
    }

 /* ========================================================================
    Description:    Destuctor
    ======================================================================== */
    Terminate() {
        this.Stop();

        // Cleanup the volume watcher
        this._volWatcher.Terminate();

        this.removeAllListeners(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_SCANNING);
        this.removeAllListeners(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY);
    }

 /* ========================================================================
    Description: Read Property accessor for the polling period (hours)

    @return {number} - Polling period in hours.
    ======================================================================== */
    get Period() {
        return this._period_hr;
    }

 /* ========================================================================
    Description: Write Property accessor for the polling period (hours)

    @param {number} [period_hr] - Polling period in hours.

    @throws {TypeError}  - thrown if 'period_hr' is not a number.
    @throws {RangeError} - thrown if 'period_hr' outside the allowed bounds.
    ======================================================================== */
    set Period(period_hr) {
        if ((period_hr === undefined) || (typeof(period_hr) !== 'number')) {
            throw new TypeError(`'period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
        }
        if ((period_hr < MIN_PERIOD_HR) && (period_hr > MAX_PERIOD_HR)) {
            throw new RangeError(`'period_hr' must be a number between ${MIN_PERIOD_HR} and ${MAX_PERIOD_HR}`);
        }

        // Update the polling period
        this._period_hr = period_hr;

        // Manage the timeout
        this.Stop();
    }

 /* ========================================================================
    Description: Read Property accessor for the minimum polling period (hours)

    @return {number} - Minimum polling period in hours.
    ======================================================================== */
    get MinimumPeriod() {
        return MIN_PERIOD_HR;
    }

 /* ========================================================================
    Description: Read Property accessor for the maximum polling period (hours)

    @return {number} - Maximum polling period in hours.
    ======================================================================== */
    get MaximumPeriod() {
        return MAX_PERIOD_HR;
    }

  /* ========================================================================
    Description: Read Property accessor for indicating if the checking of volume data is active

    @return {boolean} - true if active.
    ======================================================================== */
    get Active() {
        return (this._timeoutID !== INVALID_TIMEOUT_ID);
    }

 /* ========================================================================
    Description: Start/Restart the interrogation process.
    ======================================================================== */
    Start() {
        // Clear the decoupled start timer, if active.
        if (this._decoupledStartTimeoutID !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._decoupledStartTimeoutID);
        }

        // Stop the interrogation in case it is running.
        this.Stop();

        // Get the current uptime of the operating system
        const uptime_ms = _os.uptime() * 1000.0;
        // Has the operating system been running long enough?
        if (uptime_ms < MIN_OS_UPTIME_TO_START_MS) {
            // No. So defer the start for a bit.
            this._decoupledStartTimeoutID = setTimeout(this._DECOUPLE_Start, (MIN_OS_UPTIME_TO_START_MS-uptime_ms));
        }
        else {
            // Perform a check now.
            this._on_initiateCheck();
        }
    }

 /* ========================================================================
    Description: Stop the interrogation process, if running.
    ======================================================================== */
    Stop() {
        if (this._timeoutID !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._timeoutID);
            this._timeoutID = INVALID_TIMEOUT_ID;
        }
    }

 /* ========================================================================
    Description: Helper function used to reset an ongoing check.

    @param {boolean} [issueReady] - Flag indicating if a Ready event should be emitted.

    @remarks: Used to recover from unexpected errors.
    ======================================================================== */
    _on_reset_check(issueReady) {
        if ((issueReady === undefined) || (typeof(issueReady) !== 'boolean')) {
            console.log(issueReady);
            throw new TypeError(`issueReadyEvent is not a boolean.`);
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
            this.emit(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY, {results:[]});
        }
    }

 /* ========================================================================
    Description: Helper function used to initiate an interrogation of the
                 system volumes.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
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
        else {
            if (this._deferInitCheckTimeoutID === INVALID_TIMEOUT_ID) {
                this._deferInitCheckTimeoutID = setTimeout(this._CB__ResetCheck, MAX_RETRY_INIT_CHECK_Time, true);
            }
        }

        // Compute the number of milliseconds for the timeout.
        // Note: If there was a check in progress when we got here, try again in a little bit,
        //       do not wait for the full timeout.
        const theDelay = ( isPriorCheckInProgress ? RETRY_TIMEOUT_MS : (this._period_hr * CONVERT_HR_TO_MS) );
        // Queue another check
        this._timeoutID = setTimeout(this._CB__initiateCheck, theDelay);
    }

 /* ========================================================================
    Description:    Abstract method used to initiate interrogation on derived classes.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    _initiateInterrogation() {
        throw new Error(`Abstract Method _initiateInterrogation() invoked!`);
    }

 /* ========================================================================
    Description:    Abstract method used to reset an interrogation.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    _doReset() {
        throw new Error(`Abstract Method _doReset() invoked!`);
    }

 /* ========================================================================
    Description:    Abstract property used to determine if a check is in progress.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    get _isCheckInProgress() {
        throw new Error(`Abstract Property _checkInProgress() invoked!`);
    }

 /* ========================================================================
    Description:    Abstract property used to get an array of watch folders
                    used to initiate an interrogation.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    get _watchFolders() {
        throw new Error(`Abstract Property _watchFolders() invoked!`);
    }

 /* ========================================================================
    Description:  Helper for managing the "in progress" flag and 'ready' event
    ======================================================================== */
    _updateCheckInProgress() {
        const wasCheckInProgress = this._checkInProgress;
        this._checkInProgress = this._isCheckInProgress;
         if (wasCheckInProgress && !this._checkInProgress) {

            // Fire Ready event
            this.emit(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY, {results:this._theVolumes});

            _debug_process(`Ready event.`);
            for (const volume of this._theVolumes) {
                _debug_process(`Volume Name: ${volume.Name}`);
                _debug_process(`\tVisible:    ${volume.IsVisible}`);
                _debug_process(`\tShown:      ${volume.IsShown}`);
                _debug_process(`\tMountPoint: ${volume.MountPoint}`);
                _debug_process(`\tDevNode:    ${volume.DeviceNode}`);
                _debug_process(`\tCapacity:   ${VolumeData.ConvertFromBytesToGB(volume.Size).toFixed(4)} GB`);
                _debug_process(`\tFree:       ${VolumeData.ConvertFromBytesToGB(volume.FreeSpace).toFixed(4)} GB`);
                _debug_process(`\tUsed:       ${VolumeData.ConvertFromBytesToGB(volume.UsedSpace).toFixed(4)} GB`);
                _debug_process(`\t% Used:     ${((volume.UsedSpace/volume.Size)*100.0).toFixed(2)}%`);
            }
        }
    }

 /* ========================================================================
    Description:  Helper to compute the alert for a specific volume.

    @param { string } [volumeName]          - Name of the volume
    @param { string } [volumeUUID]          - Unique Identifier (serial number) of the volume
    @param { number}  [volumePercentFree]   - Percentage of free space (0...100)

    @throws {TypeError} - thrown for invalid arguments
    @throws {RangeError} - thrown when 'volumePercentFree' is outside the range of 0...100
    ======================================================================== */
    _determineLowSpaceAlert(volumeName, volumeUUID, volumePercentFree) {
        // Validate arguments
        if ((volumeName === undefined) || (typeof(volumeName) !== 'string') || (volumeName.length <= 0)) {
            throw new TypeError(`'volumeName' must be a non-zero length string`);
        }
        if ((volumeUUID === undefined) || (typeof(volumeUUID) !== 'string') || (volumeUUID.length <= 0)) {
            throw new TypeError(`'volumeUUID' must be a non-zero length string`);
        }
        if ((volumePercentFree === undefined) || (typeof(volumePercentFree) !== 'number')) {
            throw new TypeError(`'volumePercentFree' must be a number`);
        }
        else if ((volumePercentFree < MIN_LOW_SPACE_THRESHOLD) || (volumePercentFree > MAX_LOW_SPACE_THRESHOLD)) {
            throw new RangeError(`'volumePercentFree' must be in the range of ${MIN_LOW_SPACE_THRESHOLD}...${MAX_LOW_SPACE_THRESHOLD}. ${volumePercentFree}`);
        }

        // Determine the default alert state.
        let alert = (volumePercentFree < this._defaultAlarmThreshold);

        // Does this volume have a customization?
        const volCustomizations = this._volumeCustomizations.filter((item) => {
            const match = ( ((item.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name) &&
                             (item.volume_name.toLowerCase() === volumeName.toLowerCase())) ||
                            ((item.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber) &&
                             (item.volume_serial_num.toLowerCase() === volumeUUID.toLowerCase())) );
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

 /* ========================================================================
    Description:  Event handler for file system change detections.
                  Called when the contents of the watched folder(s) change(s).

    @param { string }           [eventType] - Type of change detected ('rename' or 'change')
    @param { string | Buffer }  [fileName]  - Name of the file or directory with the change.
    ======================================================================== */
    _handleVolumeWatcherChangeDetected(eventType, fileName) {
        // Decouple the automatic refresh.
        setImmediate((eType, fName) => {
            _debug_process(`Volume Watcher Change Detected: type:${eType} name:${fName} active:${this.Active} chkInProgress:${this._checkInProgress}`);
            // Initiate a re-scan (decoupled from the notification event), if active (even if there is a scan already in progress.)
            if (this.Active) {
                if (this._decoupledStartTimeoutID !== INVALID_TIMEOUT_ID) {
                    clearTimeout(this._decoupledStartTimeoutID);
                }
                this._decoupledStartTimeoutID = setTimeout(this._DECOUPLE_Start, FS_CHANGED_DETECTION_TIMEOUT_MS);
            }
        }, eventType, fileName);
    }

 /* ========================================================================
    Description:  Helper to determine if the volume should be shown or not.

    @param { string } [mountPoint] - Mount Point of the volume

    #return { boolena } - True if shown. False otherwise.

    @throws { TypeError } - thrown if mountPoint is not a non-null string.
    ======================================================================== */
    _isVolumeShown(mountPoint) {

        if ((mountPoint === undefined) ||
            (typeof(mountPoint) !== 'string') ||(mountPoint.length <= 0)) {
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

        return isShown
    }

 /* ========================================================================
    Description:  Helper to evaluate the validity of the custom configuration settings.

    @param { object }   [custom_config]                        - Custom per-volume configuration settings.
    @param { string }   [config.volume_id_method]              - The method for identifying the volume.
    @param { string }   [config.volume_name]                   - The name of the volume. (required when `config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name`)
    @param { string }   [config.volume_serial_num]             - The serial number of the volume. (required when `config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber`)
    @param { boolean }  [config.volume_low_space_alarm_active] - The flag indicating if the low space alarm is active or not.
    @param { number }   [config.volume_alarm_threshold]        - The  low space threshold, in percent. (required when `config.volume_low_space_alarm_active === true`)

    @return {boolean} - `true` if the configuration is valid. `false` otherwise.
    ======================================================================== */
    static _validateVolumeCustomization(custom_config) {
        // Initial sanoty check.
        let valid = (custom_config !== undefined);

        if (valid) {
            // Volume Id Method
            if ((!Object.prototype.hasOwnProperty.call(custom_config, 'volume_id_method')) ||
                (typeof(custom_config.volume_id_method) !=='string')                       ||
                (Object.values(VOLUME_IDENTIFICATION_METHODS).indexOf(custom_config.volume_id_method) < 0)) {
                    valid = false;
            }
            // Volume Name
            if (valid &&
                (custom_config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name) &&
                ((!Object.prototype.hasOwnProperty.call(custom_config, 'volume_name')) ||
                 (typeof(custom_config.volume_name) !=='string')                       ||
                 (custom_config.volume_name.length <= 0))) {
                valid = false;
            }
            // Volume Serial Number
            if (valid &&
                (custom_config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber) &&
                ((!Object.prototype.hasOwnProperty.call(custom_config, 'volume_serial_num')) ||
                 (typeof(custom_config.volume_serial_num) !=='string')                       ||
                 (custom_config.volume_serial_num.length <= 0))) {
                valid = false;
            }
            // Low Space Alarm Active
            if ((!Object.prototype.hasOwnProperty.call(custom_config, 'volume_low_space_alarm_active')) ||
                (typeof(custom_config.volume_low_space_alarm_active) !=='boolean')) {
                valid = false;
            }
            // Low Space Alarm Threshold
            if (valid &&
                custom_config.volume_low_space_alarm_active &&
                ((!Object.prototype.hasOwnProperty.call(custom_config, 'volume_alarm_threshold')) ||
                 (typeof(custom_config.volume_alarm_threshold) !=='number')                       ||
                 (custom_config.volume_alarm_threshold <= MIN_LOW_SPACE_THRESHOLD)                ||
                 (custom_config.volume_alarm_threshold >= MAX_LOW_SPACE_THRESHOLD))) {
                valid = false;
            }
        }

        return valid;
    }

 /* ========================================================================
    Description:  Helper to evaluate the validity of the volume exclusion configuration.

    @param { object }   [mask_config]                          - Volume exclusion mask.

    @return {boolean} - `true` if the exclusion mask is valid. `false` otherwise.
    ======================================================================== */
    static _validateVolumeExclusionMask(mask_config) {
        let valid = (mask_config !== undefined);

        if (valid) {
            valid = (typeof(mask_config) === 'string');
        }
        return valid;
    }
}
