/**
 * @description Controls the collection of volume specific information and attributes to be published to homekit.
 * @copyright December 2020
 * @author Mike Price <dev.grumptech@gmail.com>
 * @module VolumeInterrogatorDarwinModule
 * @requires debug
 * @see {@link https://github.com/debug-js/debug#readme}
 * @requires plist
 * @see {@link https://github.com/TooTallNate/plist.js#readme}
 */

// Internal dependencies.
import {VolumeInterrogatorBase as _VolumeInterrogatorBase} from './volumeInterrogatorBase.mjs';
import {VOLUME_TYPES, VolumeData} from './volumeData.mjs';
import {default as SpawnHelper, SPAWN_HELPER_EVENTS as _SpawnHelperEvents} from 'grumptech-spawn-helper';

// External dependencies and imports.
import _debugModule from 'debug';
import _plistModule from 'plist';

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
 * @description Derived class for darwin-based (OSX/macOS) volume interrogation
 * @augments _VolumeInterrogatorBase
 */
export class VolumeInterrogator_darwin extends _VolumeInterrogatorBase {    // eslint-disable-line camelcase
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
            (operatingSystem.length <= 0) || (operatingSystem.toLowerCase() !== 'darwin')) {
            throw new Error(`Operating system not supported. os:${operatingSystem}`);
        }

        // Initialize the base class.
        super(config);

        // Initialize data members.
        this._pendingFileSystems            = [];
        this._pendingVolumes                = [];
        this._theVisibleVolumeNames         = [];

        // Callbacks bound to this object.
        this._CB__list_known_virtual_filesystems_complete   = this._on_lsvfs_complete.bind(this);
        this._CB__display_free_disk_space_complete          = this._on_df_complete.bind(this);
        this._CB__visible_volumes                           = this._on_process_visible_volumes.bind(this);
        this._CB_process_diskUtil_info_complete             = this._on_process_diskutil_info_complete.bind(this);
        this._CB_process_disk_utilization_stats_complete    = this._on_process_disk_utilization_stats_complete.bind(this);
    }

    /**
     * @private
     * @description Helper function used to initiate an interrogation of the system volumes on darwin operating systems.
     * @returns {void}
     */
    _initiateInterrogation() {
        // Spawn a 'ls /Volumes' to get a listing of the 'visible' volumes.
        const lsVolumes = new SpawnHelper();
        lsVolumes.on(_SpawnHelperEvents.EVENT_COMPLETE, this._CB__visible_volumes);
        // eslint-disable-next-line new-cap
        lsVolumes.Spawn({command: 'ls', arguments: ['/Volumes']});
    }

    /**
     * @private
     * @description Helper function used to reset an interrogation.
     * @returns {void}
     */
    _doReset() {
        this._pendingFileSystems    = [];
        this._theVisibleVolumeNames = [];
        this._pendingVolumes        = [];
    }

    /**
     * @private
     * @description Read-Only Property used to determine if a check is in progress.
     * @returns {boolean} - true if a check is in progress.
     */
    get _isCheckInProgress() {
        _debug_process(`_isCheckInProgress: Pending Volume Count - ${this._pendingVolumes.length}`);

        const checkInProgress = ((this._pendingVolumes.length !== 0) ||
                                 (this._pendingFileSystems.length !== 0));

        return checkInProgress;
    }

    /**
     * @private
     * @description Read-only property used to get an array of watch folders used to initiate an interrogation.
     * @returns {string[]} - Array of folders to be watched for changes.
     */
    get _watchFolders() {
        return (['/Volumes']);
    }

    /**
     * @private
     * @description Event handler for the SpawnHelper _SpawnHelperEvents.EVENT_COMPLETE Notification
     * @param {object} response - Spawn response.
     * @param {boolean} response.valid - - Flag indicating if the spoawned process was completed successfully.
     * @param {Buffer|string|*} response.result - Result or Error data provided by the spawned process.
     * @param {*} response.token - Client specified token intended to assist in processing the result.
     * @param {SpawnHelper} response.source - Reference to the SpawnHelper that provided the results.
     * @returns {void}
     */
    _on_process_visible_volumes(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress) {
            return;
        }

        if (response.valid &&
            (response.result !== undefined)) {
            // Update the list of visible volumes
            this._theVisibleVolumeNames = response.result.toString().split('\n');

            // Spawn a 'lsvfs' to determine the number and types of known file systems.
            const diskutilList = new SpawnHelper();
            diskutilList.on(_SpawnHelperEvents.EVENT_COMPLETE, this._CB__list_known_virtual_filesystems_complete);
            // eslint-disable-next-line new-cap
            diskutilList.Spawn({command: 'lsvfs'});
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

    /**
     * @private
     * @description Event handler for the SpawnHelper _SpawnHelperEvents.EVENT_COMPLETE Notification
     * @param {object} response - Spawn response.
     * @param {boolean} response.valid - - Flag indicating if the spoawned process was completed successfully.
     * @param {Buffer|string|*} response.result - Result or Error data provided by the spawned process.
     * @param {*} response.token - Client specified token intended to assist in processing the result.
     * @param {SpawnHelper} response.source - Reference to the SpawnHelper that provided the results.
     * @returns {void}
     */
    _on_lsvfs_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress) {
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
                    const fsCount = Number.parseInt(fields[INDEX_FILE_SYSTEM_COUNT], 10);
                    if (fsCount > 0) {
                        const newFS = {type: fields[INDEX_FILE_SYSTEM_TYPE].toLowerCase(), count: fsCount, flags: fields[INDEX_FILE_SYSTEM_FLAGS].toLowerCase()};

                        // Sanity. Ensure this file system type is not already in the pending list.
                        const existingFSIndex = this._pendingFileSystems.findIndex((item) => {
                            const isMatch = (item.type.toLowerCase() === newFS.type);
                            return isMatch;
                        });
                        if (existingFSIndex < 0) {
                            // Add this file system type to the pending list.
                            this._pendingFileSystems.push(newFS);

                            // Spawn a 'diskutil list' to see all the disk/volume data
                            _debug_process(`Spawn df for fs type '${newFS.type}'.`);
                            const diskUsage = new SpawnHelper();
                            diskUsage.on(_SpawnHelperEvents.EVENT_COMPLETE, this._CB__display_free_disk_space_complete);
                            // eslint-disable-next-line new-cap
                            diskUsage.Spawn({command: 'df', arguments: ['-a', '-b', '-T', newFS.type], token: newFS});
                        }
                        else {
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
            this.emit('ready', {results: []});
        }
    }

    /**
     * @private
     * @description Event handler for the SpawnHelper _SpawnHelperEvents.EVENT_COMPLETE Notification
     * @param {object} response - Spawn response.
     * @param {boolean} response.valid - - Flag indicating if the spoawned process was completed successfully.
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

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress) {
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
                    throw new TypeError('Spawn token is not a string.');
                }
                // Ensure that the pending file system list contains the token.
                if (this._pendingFileSystems.includes(response.token)) {
                    // Remove token from the list.
                    this._pendingFileSystems = this._pendingFileSystems.filter((item) => {
                        const isEqual = ((item.type !== response.token.type) ||
                                         (item.count !== response.token.count) ||
                                         (item.flags !== response.token.flags));
                        return isEqual;
                    });
                }
                else {
                    throw new Error('Spawn token is not in the pending file system list.');
                }
            }
            else {
                throw new Error('Spawn token is missing.');
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
                    const fields = element.split(REGEX_WHITE_SPACE);

                    // Note: The Mount Point may include white space. Handle that possibility
                    const fieldsMountPoint = fields.slice(INDEX_FILE_SYSTEM_MOUNT_PT, fields.length);
                    fields[INDEX_FILE_SYSTEM_MOUNT_PT] = fieldsMountPoint.join(' ');

                    const newVol = {
                        device_node: fields[INDEX_FILE_SYSTEM_NAME].toLowerCase(),
                        blocks: Number.parseInt(fields[INDEX_FILE_SYSTEM_512BLOCKS], 10),
                        used_blks: Number.parseInt(fields[INDEX_FILE_SYSTEM_USED_BLOCKS], 10),
                        avail_blks: Number.parseInt(fields[INDEX_FILE_SYSTEM_AVAILABLE_BLOCKS], 10),
                        capacity: Number.parseInt(fields[INDEX_FILE_SYSTEM_CAPACITY].slice(0, -1), 10),
                        mount_point: fields[INDEX_FILE_SYSTEM_MOUNT_PT],
                    };

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
                        volume_type:        response.token.type,
                        mount_point:        newVol.mount_point,
                        volume_uuid:        'unknown',
                        device_node:        newVol.device_node,
                        capacity_bytes:     newVol.blocks * BLOCKS512_TO_BYTES,
                        free_space_bytes:   (newVol.blocks - newVol.used_blks) * BLOCKS512_TO_BYTES,
                        visible:            this._theVisibleVolumeNames.includes(volName),
                        low_space_alert:    lowSpaceAlert,
                    });
                    /* eslint-enable key-spacing */

                    // Get more informaion on this volume.
                    _debug_process(`Initiating 'diskutil info' for DiskId '${volData.DeviceNode}'`);
                    const diskutilInfo = new SpawnHelper();
                    diskutilInfo.on(_SpawnHelperEvents.EVENT_COMPLETE, this._CB_process_diskUtil_info_complete);
                    // eslint-disable-next-line new-cap
                    diskutilInfo.Spawn({command: 'diskutil', arguments: ['info', '-plist', volData.DeviceNode], token: volData});

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
            this.emit('ready', {results: []});
        }
    }

    /**
     * @private
     * @description Event handler for the SpawnHelper _SpawnHelperEvents.EVENT_COMPLETE Notification
     * @param {object} response - Spawn response.
     * @param {boolean} response.valid - - Flag indicating if the spoawned process was completed successfully.
     * @param {Buffer|string|*} response.result - Result or Error data provided by the spawned process.
     * @param {*} response.token - Client specified token intended to assist in processing the result.
     * @param {SpawnHelper} response.source - Reference to the SpawnHelper that provided the results.
     * @returns {void}
     */
    _on_process_diskutil_info_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config(response.result.toString());

        let errorEncountered = false;

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress) {
            return;
        }

        if (response.valid) {
            try {
                // Prurge the pending volumes listing.
                if (response.token instanceof VolumeData) {
                    if (this._pendingVolumes.includes(response.token)) {
                        // Remove this item from the pending list.
                        // eslint-disable-next-line arrow-body-style
                        this._pendingVolumes = this._pendingVolumes.filter((item) => {
                            return item !== response.token;
                        });
                    }
                    else {
                        // Unknown token !!

                        // Clear the check in progress.
                        this._checkInProgress = false;
                        // Flag the error
                        errorEncountered = true;
                        _debug_process('Unexpected call to _on_process_diskutil_info_complete. token not pending.');
                        _debug_process(response.token);
                    }
                }
                else {
                    // Unexpected token data !!

                    // Clear the check in progress.
                    this._checkInProgress = false;
                    // Flag the error
                    errorEncountered = true;
                    _debug_process('Unexpected call to _on_process_diskutil_info_complete. token is not instance of VolumeData.');
                    _debug_process(response.token);
                }

                if (!errorEncountered) {
                    // Attempt to parse the data as a plist.
                    const config = _plistModule.parse(response.result.toString());

                    // Determine if the volume should be shown.
                    const  isShown = this._isVolumeShown(response.token.MountPoint);

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
                            ((Object.prototype.hasOwnProperty.call(config, 'VolumeUUID') &&         (typeof(config.VolumeUUID)          === 'string'))       ||
                            (!Object.prototype.hasOwnProperty.call(config, 'VolumeUUID')))                                                                   &&
                            (Object.prototype.hasOwnProperty.call(config, 'Size') &&                 (typeof(config.Size)               === 'number'))       &&
                            // Free space is reported based on the file system type.
                            (((Object.prototype.hasOwnProperty.call(config, 'FreeSpace') &&          (typeof(config.FreeSpace)          === 'number')))      ||
                            (Object.prototype.hasOwnProperty.call(config, 'APFSContainerFree') && (typeof(config.APFSContainerFree)  === 'number'))))          {
                            // Then, process the data provided.
                            // Free space is reported based on the file system type.
                            const freeSpace  = ((config.FilesystemType === VOLUME_TYPES.TYPE_APFS) ? config.APFSContainerFree : config.FreeSpace);
                            // For volumes that do not have a volume UUID, use the device node.
                            const volumeUUID = ((Object.prototype.hasOwnProperty.call(config, 'VolumeUUID')) ? config.VolumeUUID : config.DeviceNode);
                            // Determine if the low space alert threshold has been exceeded.
                            const lowSpaceAlert = this._determineLowSpaceAlert(config.VolumeName, volumeUUID, ((freeSpace / config.Size) * 100.0));
                            /* eslint-disable key-spacing */
                            const volData = new VolumeData({
                                name:               config.VolumeName,
                                volume_type:        config.FilesystemType,
                                disk_id:            config.DeviceIdentifier,
                                mount_point:        config.MountPoint,
                                capacity_bytes:     config.Size,
                                device_node:        config.DeviceNode,
                                volume_uuid:        volumeUUID,
                                free_space_bytes:   freeSpace,
                                visible:            this._theVisibleVolumeNames.includes(config.VolumeName),
                                shown:              isShown,
                                low_space_alert:    lowSpaceAlert,
                            });
                            /* eslint-enable key-spacing */
                            this._theVolumes.push(volData);
                            /* eslint-disable */
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
                                du_process.on(_SpawnHelperEvents.EVENT_COMPLETE, this._CB_process_disk_utilization_stats_complete);
                                du_process.Spawn({ command:'du', arguments:['-skHx', volData.MountPoint] });
                            }
*/
                            /* eslint-enable */
                        }
                        else {
                            // Ignore the inability to process this item if there is no valid volume name.
                            // eslint-disable-next-line no-lonely-if
                            if ((Object.prototype.hasOwnProperty.call(config, 'VolumeName') && (typeof(config.VolumeName) === 'string') &&
                                (config.VolumeName.length > 0))) {
                                _debug_process('_on_process_diskutil_info_complete: Unable to handle response from diskutil.');
                            }
                        }
                    }
                    else {
                        // Result did not contain a disk identifier. This may be ok, for example if the volume is mounted via SMB.
                        // eslint-disable-next-line no-lonely-if
                        if ((Object.prototype.hasOwnProperty.call(config, 'Error')) && (typeof(config.Error) === 'boolean') && (config.Error)) {
                            // We were unable to get more detailed informatopn. Just use what we have, but update the IsShown property.
                            /* eslint-disable key-spacing */
                            const volData = new VolumeData({
                                name:               response.token.Name,
                                volume_type:        response.token.VolumeType,
                                disk_id:            response.token.DeviceIdentifier,
                                mount_point:        response.token.MountPoint,
                                capacity_bytes:     response.token.Size,
                                device_node:        response.token.DeviceNode,
                                volume_uuid:        response.token.VolumeUUID,
                                free_space_bytes:   response.token.FreeSpace,
                                visible:            response.token.IsVisible,
                                shown:              isShown,
                                low_space_alert:    response.token.LowSpaceAlert,
                            });
                            /* eslint-enable key-spacing */
                            this._theVolumes.push(volData);
                        }
                        else {
                            // Unexpected result.

                            // Clear the check in progress.
                            this._checkInProgress = false;
                            // Flag the error
                            errorEncountered = true;
                            _debug_process('Unexpected call to _on_process_diskutil_info_complete. config.');
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
            this.emit('ready', {results: []});
        }
    }

    /**
     * @private
     * @description Event handler for the SpawnHelper _SpawnHelperEvents.EVENT_COMPLETE Notification
     * @param {object} response - Spawn response.
     * @param {boolean} response.valid - - Flag indicating if the spoawned process was completed successfully.
     * @param {Buffer|string|*} response.result - Result or Error data provided by the spawned process.
     * @param {*} response.token - Client specified token intended to assist in processing the result.
     * @param {SpawnHelper} response.source - Reference to the SpawnHelper that provided the results.
     * @returns {void}
     */
    _on_process_disk_utilization_stats_complete(response) {
        _debug_config(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);

        // If a prior error was detected, ignore future processing
        if (!this._checkInProgress) {
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
            if (fields.length === 2) {
                // eslint-disable-next-line new-cap
                const usedBytes     = VolumeData.ConvertFrom1KBlockaToBytes(Number.parseInt(fields[0], 10));
                const volumeName    = fields[1].trim();
                // eslint-disable-next-line new-cap
                _debug_process(`du results: Name:${volumeName} Used:${VolumeData.ConvertFromBytesToGB(usedBytes)} raw:${Number.parseInt(fields[0], 10)}`);

                // Verify that we were looking for this mount point.
                if (this._pendingVolumes.includes(volumeName)) {
                    // First, remove this item from the pending list.
                    this._pendingVolumes = this._pendingVolumes.filter((item) => (item !== volumeName));

                    // Find the matching volume in the list.
                    let matchedIndex;
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
                        _debug_process('Unable to identify unique volumeData item.');
                        throw new Error('Unable to identify unique volumeData item.');
                    }

                    // Create a new volume data item to replace the original
                    const volData = new VolumeData({
                        /* eslint-disable key-spacing */
                        name:               matchedItem[0].Name,
                        volume_type:        matchedItem[0].VolumeType,
                        disk_id:            matchedItem[0].DiskId,
                        mount_point:        matchedItem[0].MountPoint,
                        capacity_bytes:     matchedItem[0].Size,
                        device_node:        matchedItem[0].DeviceNode,
                        volume_uuid:        matchedItem[0].VolumeUUID,
                        free_space_bytes:   matchedItem[0].FreeSpace,
                        visible:            matchedItem[0].IsVisible,
                        low_space_alert:    matchedItem[0].LowSpaceAlert,
                        used_space_bytes:   usedBytes,
                        /* eslint-enable key-spacing */
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

    /**
     * @private
     * @description  Helper for extracting the disk identifiers from the data provided by 'diskutil list' for HFS+ volumes.
     * @param {object} disks - list of disk data provided by 'diskutil list' for non-APFS disks.
     * @returns {string[]} - Array of disk identifiers.
     * @throws {TypeError} - thrown for enteries that are not specific to Partitions or if the input is not an array
     * @todo - Not used at present time.
     */
    _partitionDiskIdentifiers(disks) {
        if ((disks === undefined) || (!Array.isArray(disks))) {
            throw new TypeError('disk must be an array');
        }

        const diskIdentifiers = [];

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
                        _debug_process('_partitionDiskIdentifiers(): partition is not as expected. Missing or Invalid Disk Identifier.');
                        throw new TypeError('partition is not as expected. Missing or Invalid Disk Identifier.');
                    }
                }
            }
            else {
                _debug_process('_partitionDiskIdentifiers(): drive is not as expected. No partitions.');
                throw new TypeError('drive is not as expected. No partitions.');
            }
        }

        return diskIdentifiers;
    }

    /**
     * @private
     * @description Helper for extracting the disk identifiers from the data provided by 'diskutil list' for AFPS volumes.
     * @param {object[]} containers - list of AFPS container data provided by 'diskutil list'
     * @returns {string[]} - Array of disk identifiers.
     * @throws {TypeError} - thrown for enteries that are not specific to Partitions or if the input is not an array
     * @todo - Not used at present time.
     */
    _apfsDiskIdentifiers(containers) {
        if ((containers === undefined) || (!Array.isArray(containers))) {
            throw new TypeError('containers must be an array');
        }

        const diskIdentifiers = [];

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
                        _debug_process('_apfsDiskIdentifiers(): volume is not as expected. Missing or Invalid Disk Identifier.');
                        throw new TypeError('volume is not as expected. Missing or Invalid Disk Identifier.');
                    }
                }
            }
            else {
                _debug_process('_apfsDiskIdentifiers(): volume is not as expected. (AFPS)');
                throw new TypeError('volume is not as expected. (AFPS)');
            }
        }

        return diskIdentifiers;
    }
}
// eslint-disable-next-line camelcase
export default VolumeInterrogator_darwin;
