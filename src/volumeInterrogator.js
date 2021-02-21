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
import EventEmitter from 'events';

// Internal dependencies.
import { SpawnHelper } from './spawnHelper.js';
import { VOLUME_TYPES, VolumeData, CONVERSION_BASES } from './volumeData.js';

// Bind debug to console.log
_debug_process.log = console.log.bind(console);
_debug_config.log  = console.log.bind(console);

// Helpful constants and conversion factors.
const DEFAULT_PERIOD_HR     = 6.0;
const MIN_PERIOD_HR         = (5.0 / 60.0);     // Once every 5 minutes.
const MAX_PERIOD_HR         = (31.0 * 24.0);    // Once per month.
const CONVERT_HR_TO_MS      = (60.0 * 60.0 * 1000.0);
const INVALID_TIMEOUT_ID    = -1;

/* ==========================================================================
   Class:              VolumeInterrogator
   Description:	       Manager for interrogating volumes on the system
   Copyright:          Dec 2020

   @event 'ready' => function({object})
   @event_param {<VolumeData>}  [results]  - Array of volume data results.
   Event emmitted when the (periodic) interrogation is completes.
   ========================================================================== */
export class VolumeInterrogator extends EventEmitter {
 /* ========================================================================
    Description:    Constructor

    @param {object} [config] - The settings to use for creating the object.
    @param {number} [config.period_hr] - The time (in hours) for periodically interrogating the system.

    @return {object}  - Instance of the SpawnHelper class.

    @throws {TypeError}  - thrown if the configuration is not undefined.
    @throws {RangeError} - thrown if the configuration parameters are out of bounds.
    ======================================================================== */
    constructor(config) {

        let polling_period = DEFAULT_PERIOD_HR;
        if ((config !== undefined) && (config.hasOwnProperty('period_hr'))) {
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
        
        // Initialize the base class.
        super();

        // Initialize data members.
        this._timeoutID                     = INVALID_TIMEOUT_ID;
        this._checkInProgress               = false;
        this._period_hr                     = DEFAULT_PERIOD_HR;
        this._pendingVolumes                = [];
        this._theVolumes                    = [];
        this._theVisibleVolumeNames         = [];

        // Callbacks bound to this object.
        this._CB__initiateCheck                             = this._on_initiateCheck.bind(this);
        this._CB__visible_volumes                           = this._on_process_visible_volumes.bind(this);
        this._CB_process_diskUtil_list_complete             = this._on_process_diskutil_list_complete.bind(this);
        this._CB_process_diskUtil_info_complete             = this._on_process_diskutil_info_complete.bind(this);
        this._CB_process_disk_utilization_stats_complete    = this._on_process_disk_utilization_stats_complete.bind(this);

        // Set the polling period
        this.Period = polling_period;
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
        if (this._timeoutID !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._timeoutID);
        }
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
    Description: Start/Restart the interrogation process.
    ======================================================================== */
    Start() {

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
        }
    }

 /* ========================================================================
    Description: Helper function used to initiate an interrogation of the 
                 system volumes.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _on_initiateCheck() {
        if (!this._checkInProgress) {
            // Mark that the check is in progress.
            this._checkInProgress = true;

            // Clear the previously known volune data.
            this._theVisibleVolumeNames = [];
            this._theVolumes            = [];

            // Spawn a 'ls /Volumes' to get a listing of the 'visible' volumes.
            const ls_Volumes = new SpawnHelper();
            ls_Volumes.on('complete', this._CB__visible_volumes);
            ls_Volumes.Spawn({ command:'ls', arguments:['/Volumes'] });
        }

        // Compute the number of milliseconds for the timeout
        const theDelay = this._period_hr * CONVERT_HR_TO_MS;
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
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_process_visible_volumes(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result);

        if (response.valid && 
            (response.result !== undefined)) {
            // Update the list of visible volumes
            this._theVisibleVolumeNames = response.result.toString().split('\n');

            // Spawn a 'diskutil list' to see all the disk/volume data
            const diskutil_list = new SpawnHelper();
            diskutil_list.on('complete', this._CB_process_diskUtil_list_complete);
            diskutil_list.Spawn({ command:'diskutil', arguments:['list', '-plist'] });
        }
        else {
            throw new Error(`Unexpected response: type:${typeof(response.result)}`);
        }
    }

 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by 
                                                               the spawned process.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_process_diskutil_list_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result);

        if (response.valid) {
            try {
                // Attempt to parse the data as a plist.
                const config = _plist.parse(response.result.toString());
                
                if (config.hasOwnProperty('AllDisksAndPartitions')) {
                    let volumesHFSPlus  = [];
                    let volumesAFPS     = [];
                    const allDisksAndParts = config.AllDisksAndPartitions;

                    // Iterate over the disks and partitoins and gather the HFS+ and AFPS entries.
                    for (const item of allDisksAndParts) {
                        if (item.hasOwnProperty('Content')) {
                            if (item.Content.toLowerCase() === 'apple_hfs') {
                                // Append to the HFS+ list
                                volumesHFSPlus.push(item);
                            }
                            else if ((item.hasOwnProperty('APFSPhysicalStores')) &&
                                     (item.hasOwnProperty('APFSVolumes'))) {
                                // Append to the AFPS list
                                volumesAFPS.push(item);
                            }
                        }
                        else {
                            _debug_process('No Content entry');
                        }
                    }

                    // Get a list of disk identifiers for the HFS+ Volumes.
                    const hfsDiskIdentifiers  = this._hfsDiskIdentifiers(volumesHFSPlus);
                    // Get a list of disk identifiers for the AFPS Volumes.
                    const apfsDiskIdentifiers = this._apfsDiskIdentifiers(volumesAFPS);

                    // Combine the lists of disk identifiers.
                    this._pendingVolumes = hfsDiskIdentifiers.concat(apfsDiskIdentifiers);

                    // Iterate over the disk ids and spawn a 'diskutil info' request.
                    for (const diskId of this._pendingVolumes) {
                        const diskutil_info = new SpawnHelper();
                        diskutil_info.on('complete', this._CB_process_diskUtil_info_complete);
                        diskutil_info.Spawn({ command:'diskutil', arguments:['info', '-plist', diskId] });
                    }
                }
                else {
                    this._checkInProgress = false;
                    throw new Error(`Invalid configuration. 'AllDisksAndPartitions' missing.`);
                }
            }
            catch (error) {
                this._checkInProgress = false;
                _debug_process(`Error processing 'diskutil list'. Err:${error}`);
            }
        }
    }

 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by 
                                                               the spawned process.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_process_diskutil_info_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result);

        if (response.valid) {
            try {
                // Attempt to parse the data as a plist.
                const config = _plist.parse(response.result.toString());

                // Validate the config data.
                if ((config.hasOwnProperty('VolumeName') &&         (typeof(config.VolumeName)          === 'string')) &&
                    (config.hasOwnProperty('FilesystemType') &&     (typeof(config.FilesystemType)      === 'string')) &&
                    (config.hasOwnProperty('DeviceIdentifier') &&   (typeof(config.DeviceIdentifier)    === 'string')) &&
                    (config.hasOwnProperty('MountPoint') &&         (typeof(config.MountPoint)          === 'string')) &&
                    (config.hasOwnProperty('DeviceNode') &&         (typeof(config.DeviceNode)          === 'string')) &&
                    (config.hasOwnProperty('VolumeUUID') &&         (typeof(config.VolumeUUID)          === 'string')) &&
                    (config.hasOwnProperty('Size') &&               (typeof(config.Size)                === 'number')) &&
                    // Free space is reported based on the file system type.
                    (((config.hasOwnProperty('FreeSpace') &&        (typeof(config.FreeSpace)           === 'number'))) ||
                        (config.hasOwnProperty('APFSContainerFree') && (typeof(config.APFSContainerFree)   === 'number')))) {

                    // Get the device identifier for this volume and manage the pending 
                    // items.
                    if (this._pendingVolumes.includes(config.DeviceIdentifier)) {
                        // First, remove this item from the pending list.
                        this._pendingVolumes = this._pendingVolumes.filter( (item) => {
                            return item !== config.DeviceIdentifier;
                        });
                    
                        // Then, process the data provided.
                        // Free space is reported based on the file system type.
                        const freeSpace = ((config.FilesystemType === VOLUME_TYPES.TYPE_APFS) ? config.APFSContainerFree : config.FreeSpace);
                        const volData = new VolumeData({name:               config.VolumeName,
                                                        volume_type:        config.FilesystemType,
                                                        disk_id:            config.DeviceIdentifier,
                                                        mount_point:        config.MountPoint,
                                                        capacity_bytes:     config.Size,
                                                        device_node:        config.DeviceNode,
                                                        volume_uuid:        config.VolumeUUID,
                                                        free_space_bytes:   freeSpace,
                                                        visible:            this._theVisibleVolumeNames.includes(config.VolumeName)
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

                        // Finally, update the 'check in progress' flag.
                        this._updateCheckInProgress();
                    }
                    else {
                        throw new Error(`Unexpected call to _on_process_diskutil_info_complete. config:${config}`);
                    }
                }
                else {
                    throw new TypeError('Missing or invalid response from diskutil.');
                }
            }
            catch (error) {
                _debug_process(`Error processing 'diskutil info'. Err:${error}`);
            }
        }
    }

 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                               was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by 
                                                               the spawned process.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
    _on_process_disk_utilization_stats_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);

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
                    if ((matchedItem === undefined) || (matchedItem.length !== 1) || (matchedItem === undefined)) {
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
                                                    used_space_bytes:   used_bytes
                    });

                    // Replace the item in the array with the updated one.
                    this._theVolumes[matchedIndex] = volData;

                    // Finally, update the 'check in progress' flag.
                    this._updateCheckInProgress();
                }
                else {
                    throw new Error(`Unexpected call to _on_process_disk_utilization_stats_complete. mount_point:${fields[1]}`);
                }
            }
            else {
                throw Error(`Unable to paese 'du' results`);
            }
        }
    }

 /* ========================================================================
    Description:  Helper for extracting the disk identifiers from the data provided
                  by 'diskutil list' for HFS+ volumes.

    @param { object } [volumes] - list of HFS+ volume data provided by 'diskutil list'

    @return { [string] } - Array of disk identifiers.

    @throws {TypeError} - thrown for enteries that are not specific to HFS+ volumes.
    ======================================================================== */
    _hfsDiskIdentifiers(volumes) {
        if ((volumes === undefined) || (!Array.isArray(volumes))) {
            throw new TypeError(`volumes must be an array`);
        }
    
        let diskIdentifiers = [];

        for (const volume of volumes) {
            if ((volume.hasOwnProperty('Content') &&
                (volume.Content.toLowerCase() === 'apple_hfs'))) {
                // Validate that we can access the disk identifier.
                if ((volume.hasOwnProperty('DeviceIdentifier') &&
                    (typeof(volume.DeviceIdentifier) === 'string'))) {
                    // Record the identifier.
                    diskIdentifiers.push(volume.DeviceIdentifier);
                }
                else {
                    throw new TypeError(`volume is not as expected. Missing or Invalid Disk Identifier.`);
                }
            }
            else {
                throw new TypeError(`volume is not as expected. (HFS+)`);
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
            if ((container.hasOwnProperty('APFSVolumes')) &&
                Array.isArray(container.APFSVolumes)) {
                // The data of interest is stored in the APFS volumes entry.
                for (const volume of container.APFSVolumes) {
                    // Validate that we can access the disk identifier.
                    if ((volume.hasOwnProperty('DeviceIdentifier') &&
                        (typeof(volume.DeviceIdentifier) === 'string'))) {
                        // Record the identifier.
                        diskIdentifiers.push(volume.DeviceIdentifier);
                    }
                    else {
                        throw new TypeError(`volume is not as expected. Missing or Invalid Disk Identifier.`);
                    }
                }
            }
            else {
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
        this._checkInProgress = (this._pendingVolumes.length !== 0);
        if (wasCheckInProgress && !this._checkInProgress) {

            // Fire Ready event
            this.emit('ready', {results:this._theVolumes});

            _debug_process(`Ready event.`);
            for (const volume of this._theVolumes) {
                _debug_process(`Volume Name: ${volume.Name}`);
                _debug_process(`\tVisible:    ${volume.IsVisible}`);
                _debug_process(`\tMountPoint: ${volume.MountPoint}`);
                _debug_process(`\tDevNode:    ${volume.DeviceNode}`);
                _debug_process(`\tCapacity:   ${VolumeData.ConvertFromBytesToGB(volume.Size).toFixed(4)} GB`);
                _debug_process(`\tFree:       ${VolumeData.ConvertFromBytesToGB(volume.FreeSpace).toFixed(4)} GB`);
                _debug_process(`\tUsed:       ${VolumeData.ConvertFromBytesToGB(volume.UsedSpace).toFixed(4)} GB`);
                _debug_process(`\t% Used:     ${((volume.UsedSpace/volume.Size)*100.0).toFixed(2)}%`);
            }
        }
    }
}
