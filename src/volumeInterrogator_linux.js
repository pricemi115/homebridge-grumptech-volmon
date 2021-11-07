/* ==========================================================================
   File:               volumeInterrogator_darwin.js
   Class:              Volume Interrogator for OSX/macOS (darwin)
   Description:	       Controls the collection of volume specific information
                       and attributes to be published to homekit.
   Copyright:          Nov 2021
   ========================================================================== */
'use strict';

// External dependencies and imports.
const _debug_process    = require('debug')('vi_process');
const _debug_config     = require('debug')('vi_config');

// Internal dependencies.
import { VolumeInterrogatorBase as _VolumeInterrogatorBase } from './volumeInterrogatorBase.js';
import { VOLUME_TYPES, VolumeData } from './volumeData.js';
import { SpawnHelper } from './spawnHelper.js';

// Bind debug to console.log
_debug_process.log = console.log.bind(console);
_debug_config.log  = console.log.bind(console);

// Helpful constants and conversion factors.
const BLOCKS512_TO_BYTES                = 512;
const REGEX_WHITE_SPACE                 = /\s+/;

/* ==========================================================================
   Class:              VolumeInterrogator_linux
   Description:	       Manager for interrogating volumes on the linux-based systems.
   Copyright:          Nov 2021

   @event 'ready' => function({object})
   @event_param {<VolumeData>}  [results]  - Array of volume data results.
   Event emmitted when the (periodic) interrogation is completes.

   @event 'scanning' => function({object})
   Event emmitted when a refresh/rescan is initiated.
   ========================================================================== */
export class VolumeInterrogator_linux extends _VolumeInterrogatorBase {
/* ========================================================================
    Description:    Constructor

    @param {object}     [config]                         - The settings to use for creating the object.

    @return {object}  - Instance of the volumeInterrogator_darwin class.

    @throws {Error}   - If the platform operating system is not compatible.
    ======================================================================== */
    constructor(config) {

        // Sanity - ensure the Operating System is supported.
        const operating_system = process.platform;
        if ((operating_system === undefined) || (typeof(operating_system) !== 'string') ||
            (operating_system.length <= 0) || (operating_system.toLowerCase() !== 'linux')) {
            throw new Error(`Operating system not supported. os:${operating_system}`);
        }

        // Initialize the base class.
        super(config);

        this._dfSpawnInProgress = false;

        this._CB__display_free_disk_space_complete          = this._on_df_complete.bind(this);
    }

 /* ========================================================================
    Description: Helper function used to initiate an interrogation of the
                 system volumes on darwin operating systems.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _initiateInterrogation() {
        // Set Check-in-Progress.
        this._dfSpawnInProgress = true;

        // Spawn a 'ls /Volumes' to get a listing of the 'visible' volumes.
        const diskUsage = new SpawnHelper();
        diskUsage.on('complete', this._CB__display_free_disk_space_complete);
        diskUsage.Spawn({ command:'df', arguments:['--block-size=512', '--portability', '--print-type', '--exclude-type=tmpfs', '--exclude-type=devtmpfs'] });
    }

 /* ========================================================================
    Description: Helper function used to reset an interrogation.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _doReset() {
        // Clear Check-in-Progress.
        this._dfSpawnInProgress = false;
    }

 /* ========================================================================
    Description:    Read-Only Property used to determine if a check is in progress.

    @return {boolean} - true if a check is in progress.
    ======================================================================== */
    get _isCheckInProgress() {
        return this._dfSpawnInProgress;
    }

 /* ========================================================================
    Description:    Read-only property used to get an array of watch folders
                    used to initiate an interrogation.

    @return {[string]} - Array of folders to be watched for changes.
    ======================================================================== */
    get _watchFolders() {
        return (['/media', '/mnt']);
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

        // Clear the spawn in progress.
        this._dfSpawnInProgress = false;

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress)
        {
            return;
        }

        const INDEX_FILE_SYSTEM_NAME  = 0;
        const INDEC_FILE_SYSTEM_TYPE = 1;
        const INDEX_FILE_SYSTEM_512BLOCKS = 2;
        const INDEX_FILE_SYSTEM_USED_BLOCKS = 3;
        const INDEX_FILE_SYSTEM_AVAILABLE_BLOCKS = 4;
        const INDEX_FILE_SYSTEM_CAPACITY = 5;
        const INDEX_FILE_SYSTEM_MOUNT_PT = 6;

        if (response.valid &&
            (response.result !== undefined)) {
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

                const newVol = { device_node:fields[INDEX_FILE_SYSTEM_NAME].toLowerCase(), fs_type:fields[INDEC_FILE_SYSTEM_TYPE], blocks:Number.parseInt(fields[INDEX_FILE_SYSTEM_512BLOCKS]), used_blks:Number.parseInt(fields[INDEX_FILE_SYSTEM_USED_BLOCKS]),
                                    avail_blks:Number.parseInt(fields[INDEX_FILE_SYSTEM_AVAILABLE_BLOCKS]), capacity:Number.parseInt(fields[INDEX_FILE_SYSTEM_CAPACITY].slice(0,-1)), mount_point:fields[INDEX_FILE_SYSTEM_MOUNT_PT] };

                // Is this list of file systems one of the types we handle?
                if (Object.values(VOLUME_TYPES).includes(newVol.fs_type)) {

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
                                                    volume_type:        newVol.fs_type,
                                                    mount_point:        newVol.mount_point,
                                                    volume_uuid:        'unknown',
                                                    device_node:        newVol.device_node,
                                                    capacity_bytes:     newVol.blocks * BLOCKS512_TO_BYTES,
                                                    free_space_bytes:   (newVol.blocks - newVol.used_blks) * BLOCKS512_TO_BYTES,
                                                    visible:            true,
                                                    low_space_alert:    lowSpaceAlert
                    });

                    // Add this volume to the list of volumes.
                    this._theVolumes.push(volData);
                }
            });

            // This is all we had to do.
            this._updateCheckInProgress();
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
}
