/* ==========================================================================
   File:               volumeInterrogator.js
   Class:              Volume Interrogator
   Description:	       Interrogates the system to determine properties and
                       attribures of interest for volumes.
   Copyright:          Dec 2020
   ========================================================================== */
'use strict';

// External dependencies and imports.
const _debug_process    = require('debug')('vi_process');
const _debug_config     = require('debug')('vi_config');
const _plist            = require('plist');
import EventEmitter        from 'events';
import * as modFileSystem  from 'fs';

// Internal dependencies.
import { SpawnHelper } from './spawnHelper.js';
// eslint-disable-next-line no-unused-vars
import { VOLUME_TYPES, VolumeData, CONVERSION_BASES } from './volumeData.js';

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
const FS_CHANGED_DETECTION_TIMEOUT_MS   = 500 /*milliseconds */
const DEFAULT_LOW_SPACE_THRESHOLD       = 15.0;
const MIN_LOW_SPACE_THRESHOLD           = 0.0;
const MAX_LOW_SPACE_THRESHOLD           = 100.0;
const MAX_RETRY_INIT_CHECK_Time         = 120000;
const BLOCKS512_TO_BYTES                = 512;
const REGEX_WHITE_SPACE                 = /\s+/;

// Volume Identification Methods
const VOLUME_IDENTIFICATION_METHODS = {
    Name: 'name',
    SerialNumber: 'serial_num'
};

// Supported operating systems.
const SUPPORTED_OPERATING_SYSTEMS = {
    OS_DARWIN: 'darwin',
};

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
export class VolumeInterrogator extends EventEmitter {
 /* ========================================================================
    Description:    Constructor

    @param {object}     [config]                         - The settings to use for creating the object.
    @param {number}     [config.period_hr]               - The time (in hours) for periodically interrogating the system.
    @param {number}     [config.default_alarm_threshold] - The default low space threshold, in percent.
    @param { [object] } [config.volume_customizations]   - Array of objects for per-volume customizations.

    @return {object}  - Instance of the SpawnHelper class.

    @throws {TypeError}  - thrown if the configuration is not undefined.
    @throws {RangeError} - thrown if the configuration parameters are out of bounds.
    ======================================================================== */
    constructor(config) {

        let polling_period          = DEFAULT_PERIOD_HR;
        let defaultAlarmThreshold   = DEFAULT_LOW_SPACE_THRESHOLD;
        let volumeCustomizations    = [];
        let exclusionMasks          = [];

        // Get the operating system this plugin is running on.
        const operating_system = process.platform;
        // Is the Operating System Supported?
        if (Object.values(SUPPORTED_OPERATING_SYSTEMS).indexOf(operating_system) < 0) {
            throw new Error(`Operating system not supported. os:${operating_system}`);
        }

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
                        if (VolumeInterrogator._validateVolumeExclusionMask(mask)) {
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
                        if (VolumeInterrogator._validateVolumeCustomization(item)) {
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
        this._pendingFileSystems            = [];
        this._pendingVolumes                = [];
        this._theVolumes                    = [];
        this._theVisibleVolumeNames         = [];
        this._defaultAlarmThreshold         = defaultAlarmThreshold;
        this._volumeCustomizations          = volumeCustomizations;
        this._exclusionMasks                = exclusionMasks;
        this._operating_system              = operating_system;

        // Callbacks bound to this object.
        this._CB__initiateCheck                             = this._on_initiateCheck.bind(this);
        this._CB__list_known_virtual_filesystems_complete   = this._on_lsvfs_complete.bind(this);
        this._CB__display_free_disk_space_complete          = this._on_df_complete.bind(this);
        this._CB__visible_volumes                           = this._on_process_visible_volumes.bind(this);
        this._CB_process_diskUtil_info_complete             = this._on_process_diskutil_info_complete.bind(this);
        this._CB_process_disk_utilization_stats_complete    = this._on_process_disk_utilization_stats_complete.bind(this);
        this._CB__VolumeWatcherChange                       = this._handleVolumeWatcherChangeDetected.bind(this);
        this._CB__ResetCheck                                = this._on_reset_check.bind(this);
        this._DECOUPLE_Start                                = this.Start.bind(this);

        // Create a watcher on the `/Volumes` folder to initiate a re-scan
        // when changes are detected.
        this._volWatcher = modFileSystem.watch(`/Volumes`, {persistent:true, recursive:false, encoding:'utf8'}, this._CB__VolumeWatcherChange);

        // Set the polling period
        this.Period = polling_period;
    }

 /* ========================================================================
    Description:    Destuctor
    ======================================================================== */
    Terminate() {
        this.Stop();

        // Cleanup the volume watcher
        if (this._volWatcher !== undefined) {
            this._volWatcher.close();
            this._volWatcher = undefined;
        }
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
    Description: Read Property accessor for the operating system.

    @return {SUPPORTED_OPERATING_SYSTEMS(string)} - operating system.
    ======================================================================== */
    get OS() {
        return (this._operating_system);
    }

 /* ========================================================================
    Description: Start/Restart the interrogation process.
    ======================================================================== */
    Start() {

        // Clear the decoupled timer id.
        this._decoupledStartTimeoutID = INVALID_TIMEOUT_ID;

        // Stop the interrogation in case it is running.
        this.Stop();

        // Perform a check now.
        this._on_initiateCheck();
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
        this._pendingFileSystems    = [];
        this._theVisibleVolumeNames = [];
        this._theVolumes            = [];
        this._pendingVolumes        = [];

        if (this._defaultAlarmThreshold !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._defaultAlarmThreshold);
            this._defaultAlarmThreshold = INVALID_TIMEOUT_ID;
        }

        if (issueReady) {
            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results:[]});
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
            this.emit('scanning');

            // Mark that the check is in progress.
            this._checkInProgress = true;

            // Clear the previously known volune data.
            this._pendingFileSystems    = [];
            this._theVisibleVolumeNames = [];
            this._theVolumes            = [];
            this._pendingVolumes        = [];

            // Spawn a 'ls /Volumes' to get a listing of the 'visible' volumes.
            const ls_Volumes = new SpawnHelper();
            ls_Volumes.on('complete', this._CB__visible_volumes);
            ls_Volumes.Spawn({ command:'ls', arguments:['/Volumes'] });
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
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by
                                                               the spawned process.
    @param { <any> }                       [response.token]  - Client specified token intended to assist in processing the result.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_lsvfs_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress)
        {
            return;
        }

        const INDEX_FILE_SYSTEM_TYPE  = 0;
        const INDEX_FILE_SYSTEM_COUNT = 1;
        const INDEX_FILE_SYSTEM_FLAGS = 2;

        if (response.valid &&
            (response.result !== undefined)) {
            // Process the response from `lsvfs`.
                // There are two header rows and a dummy footer (as the result of the '\n' split), followd by lines with the following fields:
                // [virtual file system type], [number of file systems], [flags]
                const headerLines = 2;
                const footerLines = -1;
                const lines = response.result.toString().split('\n').slice(headerLines, footerLines);
                lines.forEach((element) => {
                    // Break up the element based on white space.
                    const fields = element.split(REGEX_WHITE_SPACE);

                    // Does the response correspond to expectations?
                    if (fields.length === 3) {
                        // Does this file system have any volumes?
                        const fsCount = Number.parseInt(fields[INDEX_FILE_SYSTEM_COUNT]);
                        if (fsCount > 0) {
                            const newFS = { type:fields[INDEX_FILE_SYSTEM_TYPE].toLowerCase(), count:fsCount, flags:fields[INDEX_FILE_SYSTEM_FLAGS].toLowerCase() };

                            // Sanity. Ensure this file system type is not already in the pending list.
                            const existingFSIndex = this._pendingFileSystems.findIndex((element) => {
                                const isMatch = (element.type.toLowerCase() === newFS.type);
                                return isMatch;
                            });
                            if (existingFSIndex < 0) {
                                // Add this file system type to the pending list.
                                this._pendingFileSystems.push(newFS);

                                // Spawn a 'diskutil list' to see all the disk/volume data
                                _debug_process(`Spawn df for fs type '${newFS.type}'.`);
                                const diskutil_list = new SpawnHelper();
                                diskutil_list.on('complete', this._CB__display_free_disk_space_complete);
                                diskutil_list.Spawn({ command:'df', arguments:['-a', '-b', '-T', newFS.type], token:newFS });
                            }
                            else
                            {
                                // Replace the existing item with this one
                                this._pendingFileSystems[existingFSIndex] = newFS;

                                _debug_process(`_on_lsvfs_complete: Duplicated file system type. '${newFS.type}'`);
                            }
                        }
                    }
                    else {
                        _debug_process(`_on_lsvfs_complete: Error processing line '${element}'`);
                        _debug_process(fields);
                    }
                });
            }
            else {
            // Clear the check in progress.
            this._checkInProgress = false;
            _debug_process(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);

            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results:[]});
        }
    }

 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by
                                                               the spawned process.
    @param { <any> }                       [response.token]  - Client specified token intended to assist in processing the result.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_df_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());
        if (response.token !== undefined) {
            _debug_config(`Spawn Token:`);
            _debug_config(response.token);
        }

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress)
        {
            return;
        }

        const INDEX_FILE_SYSTEM_NAME  = 0;
        const INDEX_FILE_SYSTEM_512BLOCKS = 1;
        const INDEX_FILE_SYSTEM_USED_BLOCKS = 2;
        const INDEX_FILE_SYSTEM_AVAILABLE_BLOCKS = 3;
        const INDEX_FILE_SYSTEM_CAPACITY = 4;
        const INDEX_FILE_SYSTEM_MOUNT_PT = 5;

        if (response.valid &&
            (response.result !== undefined)) {
            // This spawn is expected to have been issued with a token.
            if (response.token !== undefined) {
                if (typeof(response.token) !== 'object') {
                    throw new TypeError(`Spawn token is not a string.`);
                }
                // Ensure that the pending file system list contains the token.
                if (this._pendingFileSystems.includes(response.token)) {
                    // Remove token from the list.
                    this._pendingFileSystems = this._pendingFileSystems.filter((item) => {
                        const isEqual = ( (item.type !== response.token.type) ||
                                          (item.count !== response.token.count) ||
                                          (item.flags !== response.token.flags));
                        return isEqual;
                    });
                }
                else
                {
                    throw new Error(`Spawn token is not in the pending file system list.`);
                }
            }
            else
            {
                throw new Error(`Spawn token is missing.`);
            }

            // Is this list of file systems one of the types we handle?
            if (Object.values(VOLUME_TYPES).includes(response.token.type)) {
                // Process the response from `df`.
                // There are two header rows and a dummy footer (as the result of the '\n' split), followed by lines with the following fields:
                // [virtual file system type], [number of file systems], [flags]
                const headerLines = 1;
                const footerLines = -1;
                const lines = response.result.toString().split('\n').slice(headerLines, footerLines);
                lines.forEach((element) => {
                    // Break up the element based on white space.
                    let fields = element.split(REGEX_WHITE_SPACE);

                    // Note: The Mount Point may include white space. Handle that possibility
                    const fieldsMountPoint = fields.slice(INDEX_FILE_SYSTEM_MOUNT_PT, fields.length);
                    fields[INDEX_FILE_SYSTEM_MOUNT_PT] = fieldsMountPoint.join(' ');

                    const newVol = { device_node:fields[INDEX_FILE_SYSTEM_NAME].toLowerCase(), blocks:Number.parseInt(fields[INDEX_FILE_SYSTEM_512BLOCKS]), used_blks:Number.parseInt(fields[INDEX_FILE_SYSTEM_USED_BLOCKS]),
                                     avail_blks:Number.parseInt(fields[INDEX_FILE_SYSTEM_AVAILABLE_BLOCKS]), capacity:Number.parseInt(fields[INDEX_FILE_SYSTEM_CAPACITY].slice(0,-1)), mount_point:fields[INDEX_FILE_SYSTEM_MOUNT_PT] };

                    // Determine the name of the volume (text following the last '/')
                    let volName = newVol.mount_point;
                    const volNameParts = newVol.mount_point.split('/');
                    if (volNameParts.length > 0) {
                        const candidateName = volNameParts[volNameParts.length-1];
                        if (candidateName.length > 0) {
                            volName = volNameParts[volNameParts.length-1];
                        }
                    }

                    // Determine if the low space alert threshold has been exceeded.
                    const lowSpaceAlert = this._determineLowSpaceAlert(volName, "~~ not used ~~", ((newVol.avail_blks/newVol.blocks)*100.0));

                    // Create a new (and temporary) VolumeData item.
                    const volData = new VolumeData({name:               volName,
                                                    volume_type:        response.token.type,
                                                    mount_point:        newVol.mount_point,
                                                    volume_uuid:        'unknown',
                                                    device_node:        newVol.device_node,
                                                    capacity_bytes:     newVol.blocks * BLOCKS512_TO_BYTES,
                                                    free_space_bytes:   (newVol.blocks - newVol.used_blks) * BLOCKS512_TO_BYTES,
                                                    visible:            this._theVisibleVolumeNames.includes(volName),
                                                    low_space_alert:    lowSpaceAlert
                    });

                    // Get more informaion on this volume.
                    _debug_process(`Initiating 'diskutil info' for DiskId '${volData.DeviceNode}'`);
                    const diskutil_info = new SpawnHelper();
                    diskutil_info.on('complete', this._CB_process_diskUtil_info_complete);
                    diskutil_info.Spawn({ command:'diskutil', arguments:['info', '-plist', volData.DeviceNode], token:volData});

                    // Add this volume to the list of pending volumes.
                    this._pendingVolumes.push(volData);
                });
            }
        }
        else {
            // Clear the check in progress.
            this._checkInProgress = false;
            _debug_process(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);

            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results:[]});
        }
    }
 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by
                                                               the spawned process.
    @param { <any> }                       [response.token]  - Client specified token intended to assist in processing the result.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_process_visible_volumes(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress)
        {
            return;
        }

        if (response.valid &&
            (response.result !== undefined)) {
            // Update the list of visible volumes
            this._theVisibleVolumeNames = response.result.toString().split('\n');

            // Spawn a 'lsvfs' to determine the number and types of known file systems.
            const diskutil_list = new SpawnHelper();
            diskutil_list.on('complete', this._CB__list_known_virtual_filesystems_complete);
            diskutil_list.Spawn({ command:'lsvfs' });
        }
        else {
            // Clear the check in progress.
            this._checkInProgress = false;
            _debug_process(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);

            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results:[]});
        }
    }

 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by
                                                               the spawned process.
    @param { <any> }                       [response.token]  - Client specified token intended to assist in processing the result.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_process_diskutil_info_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());

        let errorEncountered = false;

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress)
        {
            return;
        }

        if (response.valid) {
            try {
                // Prurge the pending volumes listing.
                if (response.token instanceof VolumeData) {
                    if (this._pendingVolumes.includes(response.token)) {
                        // Remove this item from the pending list.
                        this._pendingVolumes = this._pendingVolumes.filter( (item) => {
                            return item !== response.token;
                        });
                    }
                    else {
                        // Unknown token !!

                        // Clear the check in progress.
                        this._checkInProgress = false;
                        // Flag the error
                        errorEncountered = true;
                        _debug_process(`Unexpected call to _on_process_diskutil_info_complete. token not pending.`);
                        _debug_process(response.token);
                    }
                }
                else {
                    // Unexpected token data !!

                    // Clear the check in progress.
                    this._checkInProgress = false;
                    // Flag the error
                    errorEncountered = true;
                    _debug_process(`Unexpected call to _on_process_diskutil_info_complete. token is not instance of VolumeData.`);
                    _debug_process(response.token);
                }

                if (!errorEncountered) {
                    // Attempt to parse the data as a plist.
                    const config = _plist.parse(response.result.toString());

                    let isShown = true;
                    for (const mask of this._exclusionMasks) {
                        _debug_process(`Evaluating exclusion mask '${mask}' for volume '${response.token.Name}'`);
                        const reMask = new RegExp(mask);
                        const matches = response.token.MountPoint.match(reMask);
                        _debug_process(matches);
                        isShown = isShown && (matches === null);
                    }

                    // Get the device identifier for this volume and manage the pending
                    // items.
                    if ((Object.prototype.hasOwnProperty.call(config, 'DeviceIdentifier')) && (typeof(config.DeviceIdentifier) === 'string')) {
                        // Validate the config data.
                        if ((Object.prototype.hasOwnProperty.call(config, 'VolumeName') &&          (typeof(config.VolumeName)          === 'string'))       &&
                            (Object.prototype.hasOwnProperty.call(config, 'FilesystemType') &&      (typeof(config.FilesystemType)      === 'string'))       &&
                            (Object.prototype.hasOwnProperty.call(config, 'DeviceIdentifier') &&    (typeof(config.DeviceIdentifier)    === 'string'))       &&
                            (Object.prototype.hasOwnProperty.call(config, 'MountPoint') &&          (typeof(config.MountPoint)          === 'string'))       &&
                            (Object.prototype.hasOwnProperty.call(config, 'DeviceNode') &&          (typeof(config.DeviceNode)          === 'string'))       &&
                            /* UDF volumes have no Volume UUID */
                            ( ( Object.prototype.hasOwnProperty.call(config, 'VolumeUUID') &&        (typeof(config.VolumeUUID)         === 'string'))       ||
                            (!Object.prototype.hasOwnProperty.call(config, 'VolumeUUID')) )                                                                  &&
                            (Object.prototype.hasOwnProperty.call(config, 'Size') &&                 (typeof(config.Size)               === 'number'))       &&
                            // Free space is reported based on the file system type.
                            ( ((Object.prototype.hasOwnProperty.call(config, 'FreeSpace') &&         (typeof(config.FreeSpace)          === 'number')))      ||
                            (Object.prototype.hasOwnProperty.call(config, 'APFSContainerFree') && (typeof(config.APFSContainerFree)  === 'number')) ))         {

                                // Then, process the data provided.
                                // Free space is reported based on the file system type.
                                const freeSpace  = ((config.FilesystemType === VOLUME_TYPES.TYPE_APFS) ? config.APFSContainerFree : config.FreeSpace);
                                // For volumes that do not have a volume UUID, use the device node.
                                const volumeUUID = ((Object.prototype.hasOwnProperty.call(config, 'VolumeUUID')) ? config.VolumeUUID : config.DeviceNode);
                                // Determine if the low space alert threshold has been exceeded.
                                const lowSpaceAlert = this._determineLowSpaceAlert(config.VolumeName, volumeUUID, ((freeSpace/config.Size)*100.0));
                                const volData = new VolumeData({name:               config.VolumeName,
                                                                volume_type:        config.FilesystemType,
                                                                disk_id:            config.DeviceIdentifier,
                                                                mount_point:        config.MountPoint,
                                                                capacity_bytes:     config.Size,
                                                                device_node:        config.DeviceNode,
                                                                volume_uuid:        volumeUUID,
                                                                free_space_bytes:   freeSpace,
                                                                visible:            this._theVisibleVolumeNames.includes(config.VolumeName),
                                                                shown:              isShown,
                                                                low_space_alert:    lowSpaceAlert
                                });
                                this._theVolumes.push(volData);
    /*
                                // APFS volumes may have some of their capacity consumed by purgable data. For example: APFS Snapshots.
                                // This purgable data can only be evaluated if the volume is mounted.
                                if ((volData.VolumeType === VOLUME_TYPES.TYPE_APFS) &&
                                    (volData.IsMounted)) {
                                    // Append the mount point to the 'pending volumes' list to keep us busy.
                                    this._pendingVolumes.push(volData.MountPoint);

                                    // Spawn a disk usage statistics ('du') process to see the accurate storage information for the
                                    // APFS volumes.
                                    const du_process = new SpawnHelper();
                                    du_process.on('complete', this._CB_process_disk_utilization_stats_complete);
                                    du_process.Spawn({ command:'du', arguments:['-skHx', volData.MountPoint] });
                                }
    */
                        }
                        else {
                            // Ignore the inability to process this item if there is no valid volume name.
                            if ((Object.prototype.hasOwnProperty.call(config, 'VolumeName') && (typeof(config.VolumeName) === 'string') &&
                                (config.VolumeName.length > 0))) {
                                _debug_process(`_on_process_diskutil_info_complete: Unable to handle response from diskutil.`);
                            }
                        }
                    }
                    else {
                        // Result did not contain a disk identifier. This may be ok, for example if the volume is mounted via SMB.
                        if ((Object.prototype.hasOwnProperty.call(config, 'Error')) && (typeof(config.Error) === 'boolean') && (config.Error)) {
                            // We were unable to get more detailed informatopn. Just use what we have, but update the IsShown property.
                            const volData = new VolumeData({name:               response.token.Name,
                                                            volume_type:        response.token.FilesystemType,
                                                            disk_id:            response.token.DeviceIdentifier,
                                                            mount_point:        response.token.MountPoint,
                                                            capacity_bytes:     response.token.Size,
                                                            device_node:        response.token.DeviceNode,
                                                            volume_uuid:        response.token.VolumeUUID,
                                                            free_space_bytes:   response.token.FreeSpace,
                                                            visible:            response.token.IsVisible,
                                                            shown:              isShown,
                                                            low_space_alert:    response.token.LowSpaceAlert
                            });
                            this._theVolumes.push(volData);
                        }
                        else {
                            // Unexpected result.

                            // Clear the check in progress.
                            this._checkInProgress = false;
                            // Flag the error
                            errorEncountered = true;
                            _debug_process(`Unexpected call to _on_process_diskutil_info_complete. config.`);
                            _debug_process(config);
                        }
                    }
                }

                // Finally, update the 'check in progress' flag.
                if (!errorEncountered) {
                     this._updateCheckInProgress();
                }
            }
            catch (error) {
                // Clear the check in progress.
                this._checkInProgress = false;
                // Flag the error
                errorEncountered = true;
                _debug_process(`Error processing 'diskutil info'. Err:${error}`);
            }
        }
        else {
            // Clear the check in progress.
            this._checkInProgress = false;
            // Flag the error
            errorEncountered = true;
            _debug_process(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);
        }

        // Was a critical error encountered while processing the data?
        if (errorEncountered) {
            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results:[]});
        }
    }

 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by
                                                               the spawned process.
    @param { <any> }                       [response.token]  - Client specified token intended to assist in processing the result.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_process_disk_utilization_stats_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress)
        {
            return;
        }

        // We expect the 'du' process to encounter errors.
        // So get the results from the object directly.
        const rawResult = response.source.Result.toString();
        // Break the result up into an array of lines.
        const lines = rawResult.split('\r');
        for (const line of lines) {
            // Split the lines by white space.
            const fields = line.split('\t');
            // Verify that there are 2 fields. These are the size and the volume name (mount point)
            if (fields.length == 2) {
                const used_bytes    = VolumeData.ConvertFrom1KBlockaToBytes(Number.parseInt(fields[0]));
                const volumeName    = fields[1].trim();
                _debug_process(`du results: Name:${volumeName} Used:${VolumeData.ConvertFromBytesToGB(used_bytes)} raw:${Number.parseInt(fields[0])}`);

                // Verify that we were looking for this mount point.
                if (this._pendingVolumes.includes(volumeName)) {
                    // First, remove this item from the pending list.
                    this._pendingVolumes = this._pendingVolumes.filter( (item) => {
                        return (item !== volumeName);
                    });

                    // Find the matching volume in the list.
                    let matchedIndex = undefined;
                    const matchedItem = this._theVolumes.filter((item, index) => {
                        const match = (item.MountPoint === volumeName);
                        // Cache the index of the match as well.
                        if (match) {
                            matchedIndex = index;
                        }
                        return match;
                    });
                    if ((matchedItem === undefined) || (matchedItem.length !== 1) || (matchedIndex < this._theVolumes.length)) {
                        // Clear the check in progress.
                        this._checkInProgress = false;
                        _debug_process(`Unable to identify unique volumeData item.`);
                        throw new Error(`Unable to identify unique volumeData item.`);
                    }

                    // Create a new volume data item to replace the original
                    const volData = new VolumeData({name:               matchedItem[0].Name,
                                                    volume_type:        matchedItem[0].VolumeType,
                                                    disk_id:            matchedItem[0].DiskId,
                                                    mount_point:        matchedItem[0].MountPoint,
                                                    capacity_bytes:     matchedItem[0].Size,
                                                    device_node:        matchedItem[0].DeviceNode,
                                                    volume_uuid:        matchedItem[0].VolumeUUID,
                                                    free_space_bytes:   matchedItem[0].FreeSpace,
                                                    visible:            matchedItem[0].IsVisible,
                                                    low_space_alert:    matchedItem[0].LowSpaceAlert,
                                                    used_space_bytes:   used_bytes
                    });

                    // Replace the item in the array with the updated one.
                    this._theVolumes[matchedIndex] = volData;

                    // Finally, update the 'check in progress' flag.
                    this._updateCheckInProgress();
                }
                else {
                    // Clear the check in progress.
                    this._checkInProgress = false;
                    _debug_process(`Unexpected call to _on_process_disk_utilization_stats_complete. mount_point:${fields[1]}`);
                    throw new Error(`Unexpected call to _on_process_disk_utilization_stats_complete. mount_point:${fields[1]}`);
                }
            }
            else {
                // Clear the check in progress.
                this._checkInProgress = false;
                _debug_process(`Unable to paese '${response.source.Command} ${response.source.Arguments}' results`);
                throw Error(`Unable to paese '${response.source.Command} ${response.source.Arguments}' results`);
            }
        }
    }

 /* ========================================================================
    Description:  Helper for extracting the disk identifiers from the data provided
                  by 'diskutil list' for HFS+ volumes.

    @param { object } [disks] - list of disk data provided by 'diskutil list' for non-APFS disks .

    @return { [string] } - Array of disk identifiers.

    @throws {TypeError} - thrown for enteries that are not specific to Partitions
    ======================================================================== */
    _partitionDiskIdentifiers(disks) {
        if ((disks === undefined) || (!Array.isArray(disks))) {
            throw new TypeError(`disk must be an array`);
        }

        let diskIdentifiers = [];

        for (const disk of disks) {
            if ((Object.prototype.hasOwnProperty.call(disk, 'Partitions')) &&
                (disk.Partitions.length > 0)) {
                for (const partition of disk.Partitions) {
                    // Validate that we can access the disk identifier.
                    if ((Object.prototype.hasOwnProperty.call(partition, 'DeviceIdentifier') &&
                        (typeof(partition.DeviceIdentifier) === 'string'))) {
                            // Record the identifier.
                            diskIdentifiers.push(partition.DeviceIdentifier);
                    }
                    else {
                        _debug_process(`_partitionDiskIdentifiers(): partition is not as expected. Missing or Invalid Disk Identifier.`);
                        throw new TypeError(`partition is not as expected. Missing or Invalid Disk Identifier.`);
                    }
                }
            }
            else {
                _debug_process(`_partitionDiskIdentifiers(): drive is not as expected. No partitions.`);
                throw new TypeError(`drive is not as expected. No partitions.`);
            }
        }

        return diskIdentifiers;
    }

 /* ========================================================================
    Description:  Helper for extracting the disk identifiers from the data provided
                  by 'diskutil list' for AFPS volumes.

    @param { object } [containers] - list of AFPS container data provided by 'diskutil list'

    @return { [string] } - Array of disk identifiers.

    @throws {TypeError} - thrown for enteries that are not specific to AFPS volumes.
    ======================================================================== */
    _apfsDiskIdentifiers(containers) {
        if ((containers === undefined) || (!Array.isArray(containers))) {
            throw new TypeError(`containers must be an array`);
        }

        let diskIdentifiers = [];

        for (const container of containers) {
            if ((Object.prototype.hasOwnProperty.call(container, 'APFSVolumes')) &&
                Array.isArray(container.APFSVolumes)) {
                // The data of interest is stored in the APFS volumes entry.
                for (const volume of container.APFSVolumes) {
                    // Validate that we can access the disk identifier.
                    if ((Object.prototype.hasOwnProperty.call(volume, 'DeviceIdentifier') &&
                        (typeof(volume.DeviceIdentifier) === 'string'))) {
                        // Record the identifier.
                        diskIdentifiers.push(volume.DeviceIdentifier);
                    }
                    else {
                        _debug_process(`_apfsDiskIdentifiers(): volume is not as expected. Missing or Invalid Disk Identifier.`);
                        throw new TypeError(`volume is not as expected. Missing or Invalid Disk Identifier.`);
                    }
                }
            }
            else {
                _debug_process(`_apfsDiskIdentifiers(): volume is not as expected. (AFPS)`);
                throw new TypeError(`volume is not as expected. (AFPS)`);
            }
        }

        return diskIdentifiers;
    }

 /* ========================================================================
    Description:  Helper for managing the "in progress" flag and 'ready' event
    ======================================================================== */
    _updateCheckInProgress() {
        const wasCheckInProgress = this._checkInProgress;
        this._checkInProgress = ((this._pendingVolumes.length !== 0) &&
                                 (this._pendingFileSystems.length === 0));
        _debug_process(`_updateCheckInProgress(): Pending Volume Count - ${this._pendingVolumes.length}`);
        if (wasCheckInProgress && !this._checkInProgress) {

            // Fire Ready event
            this.emit('ready', {results:this._theVolumes});

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
    Description:  Event handler for file system change detections.
                  Called when the contents of `/Volumes' changes.

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
