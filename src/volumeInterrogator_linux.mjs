/**
 * @description Controls the collection of volume specific information and attributes to be published to homekit.
 * @copyright December 2020
 * @author Mike Price <dev.grumptech@gmail.com>
 * @module VolumeInterrogatorLinuxModule
 * @requires debug
 * @see {@link https://github.com/debug-js/debug#readme}
 * @requires os
 * @see {@link https://nodejs.org/dist/latest-v16.x/docs/api/events.html#events}
 * @requires os
 * @see {@link https://nodejs.org/dist/latest-v16.x/docs/api/os.html}
 */
// Internal dependencies.
import {VolumeInterrogatorBase as _VolumeInterrogatorBase} from './volumeInterrogatorBase.mjs';
import {VOLUME_TYPES, VolumeData} from './volumeData.mjs';
import {default as SpawnHelper, SPAWN_HELPER_EVENTS as _SpawnHelperEvents} from 'grumptech-spawn-helper';

// External dependencies and imports.
import _debugModule from 'debug';
import {userInfo as _userInfo} from 'os';

/**
 * @private
 * @description Debugging function pointer for runtime related diagnostics.
 */
const _debug_process = _debugModule('vi_process');  // eslint-disable-line camelcase
/**
 * @private
 * @description Debugging function pointer for configuration related diagnostics.
 */
const _debug_config = _debugModule('vi_config');  // eslint-disable-line camelcase

// Bind debug to console.log
// eslint-disable-next-line camelcase, no-console
_debug_process.log = console.log.bind(console);
// eslint-disable-next-line camelcase, no-console
_debug_config.log  = console.log.bind(console);

// Helpful constants and conversion factors.
/**
 * @description Conversion factor for 512byte blocks
 * @private
 */
const BLOCKS512_TO_BYTES    = 512;
/**
 * @description Regular expression pattern for white space.
 * @private
 */
const REGEX_WHITE_SPACE     = /\s+/;

/**
 * @description Derived class for linux-based volume interrogation
 * @augments _VolumeInterrogatorBase
 */
export class VolumeInterrogator_linux extends _VolumeInterrogatorBase { // eslint-disable-line camelcase
    /**
     * @description Constructor
     * @class
     * @param {object} [config] - The settings to use for creating the object.
     * @throws {Error}  - thrown if the operating system is not supported.
     */
    constructor(config) {
        // Sanity - ensure the Operating System is supported.
        const operatingSystem = process.platform;
        if ((operatingSystem === undefined) || (typeof(operatingSystem) !== 'string') ||
            (operatingSystem.length <= 0) || (operatingSystem.toLowerCase() !== 'linux')) {
            throw new Error(`Operating system not supported. os:${operatingSystem}`);
        }

        // Initialize the base class.
        super(config);

        this._dfSpawnInProgress = false;

        this._CB__display_free_disk_space_complete = this._on_df_complete.bind(this);
    }

    /**
     * @private
     * @description Helper function used to initiate an interrogation of the system volumes on darwin operating systems.
     * @returns {void}
     */
    _initiateInterrogation() {
        // Set Check-in-Progress.
        this._dfSpawnInProgress = true;

        // Spawn a 'ls /Volumes' to get a listing of the 'visible' volumes.
        const diskUsage = new SpawnHelper();
        diskUsage.on(_SpawnHelperEvents.EVENT_COMPLETE, this._CB__display_free_disk_space_complete);
        // eslint-disable-next-line new-cap
        diskUsage.Spawn({command: 'df', arguments: ['--block-size=512', '--portability', '--print-type', '--exclude-type=tmpfs', '--exclude-type=devtmpfs']});
    }

    /**
     * @private
     * @description Helper function used to reset an interrogation.
     * @returns {void}
     */
    _doReset() {
        // Clear Check-in-Progress.
        this._dfSpawnInProgress = false;
    }

    /**
     * @private
     * @description Read-Only Property used to determine if a check is in progress.
     * @returns {boolean} - true if a check is in progress.
     */
    get _isCheckInProgress() {
        return this._dfSpawnInProgress;
    }

    /**
     * @private
     * @description Read-only property used to get an array of watch folders used to initiate an interrogation.
     * @returns {string[]} - Array of folders to be watched for changes.
     */
    get _watchFolders() {
        const {username} = _userInfo();
        _debug_process(`Username: ${username}`);

        return ([`/media/${username}`, '/mnt']);
    }

    /**
     * @private
     * @description Event handler for the SpawnHelper _SpawnHelperEvents.EVENT_COMPLETE Notification
     * @param {object} response - Spawn response.
     * @param {boolean} response.valid - Flag indicating if the spawned process was completed successfully.
     * @param {Buffer|string|*} response.result - Result or Error data provided by the spawned process.
     * @param {*} response.token - Client specified token intended to assist in processing the result.
     * @param {SpawnHelper} response.source - Reference to the SpawnHelper that provided the results.
     * @returns {void}
     */
    _on_df_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());
        if (response.token !== undefined) {
            _debug_config('Spawn Token:');
            _debug_config(response.token);
        }

        // Clear the spawn in progress.
        this._dfSpawnInProgress = false;

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress) {
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
            // There are two header rows and a dummy footer (as the result of the '\n' split),
            // followed by lines with the following fields:
            // [virtual file system type], [number of file systems], [flags]
            const headerLines = 1;
            const footerLines = -1;
            const lines = response.result.toString().split('\n').slice(headerLines, footerLines);
            lines.forEach((element) => {
                // Break up the element based on white space.
                const fields = element.split(REGEX_WHITE_SPACE);

                // Note: The Mount Point may include white space. Handle that possibility
                const fieldsMountPoint = fields.slice(INDEX_FILE_SYSTEM_MOUNT_PT, fields.length);
                fields[INDEX_FILE_SYSTEM_MOUNT_PT] = fieldsMountPoint.join(' ');

                const newVol = {
                    device_node: fields[INDEX_FILE_SYSTEM_NAME].toLowerCase(),
                    fs_type: fields[INDEC_FILE_SYSTEM_TYPE],
                    blocks: Number.parseInt(fields[INDEX_FILE_SYSTEM_512BLOCKS], 10),
                    used_blks: Number.parseInt(fields[INDEX_FILE_SYSTEM_USED_BLOCKS], 10),
                    avail_blks: Number.parseInt(fields[INDEX_FILE_SYSTEM_AVAILABLE_BLOCKS], 10),
                    capacity: Number.parseInt(fields[INDEX_FILE_SYSTEM_CAPACITY].slice(0, -1), 10),
                    mount_point: fields[INDEX_FILE_SYSTEM_MOUNT_PT],
                };

                // Is this list of file systems one of the types we handle?
                if (Object.values(VOLUME_TYPES).includes(newVol.fs_type)) {
                    // Determine the name of the volume (text following the last '/')
                    let volName = newVol.mount_point;
                    const volNameParts = newVol.mount_point.split('/');
                    if (volNameParts.length > 0) {
                        const candidateName = volNameParts[volNameParts.length - 1];
                        if (candidateName.length > 0) {
                            volName = volNameParts[volNameParts.length - 1];
                        }
                    }

                    // Determine if the low space alert threshold has been exceeded.
                    const lowSpaceAlert = this._determineLowSpaceAlert(volName, '~~ not used ~~', ((newVol.avail_blks / newVol.blocks) * 100.0));

                    // Create a new (and temporary) VolumeData item.
                    /* eslint-disable key-spacing */
                    const volData = new VolumeData({
                        name:               volName,
                        volume_type:        newVol.fs_type,
                        mount_point:        newVol.mount_point,
                        volume_uuid:        'unknown',
                        device_node:        newVol.device_node,
                        capacity_bytes:     newVol.blocks * BLOCKS512_TO_BYTES,
                        free_space_bytes:   (newVol.blocks - newVol.used_blks) * BLOCKS512_TO_BYTES,
                        visible:            true,
                        shown:              this._isVolumeShown(newVol.mount_point),
                        low_space_alert:    lowSpaceAlert,
                    });
                    /* eslint-enable key-spacing */

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
            this.emit('ready', {results: []});
        }
    }
}
// eslint-disable-next-line camelcase
export default VolumeInterrogator_linux;
