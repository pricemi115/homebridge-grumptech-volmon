/* ==========================================================================
   File:               volumeData.js
   Class:              Volume Data
   Description:	       Provides read/write access to data metrics of interest.
   Copyright:          Dec 2020
   ========================================================================== */
'use strict';

// External dependencies and imports.
const _debug = require('debug')('vol_data');

// Bind debug to console.log
_debug.log = console.log.bind(console);

// Helpful constants and conversion factors.
const BYTES_TO_GB_BASE2     = (1024.0 * 1024.0 * 1024.0);
const BYTES_TO_GB_BASE10    = (1000.0 * 1000.0 * 1000.0);
const BLOCK_1K_TO_BYTES     = 1024.0;

 /* ========================================================================
    Description:    Enumeration of supported file systems
    ======================================================================== */
export const VOLUME_TYPES = {
    TYPE_UNKNOWN  : 'unknown',
    TYPE_HFS_PLUS : 'hfs',
    TYPE_APFS     : 'apfs',
    TYPE_UDF      : 'udf',       /* Universal Disk Format (ISO, etc) */
    TYPE_MSDOS    : 'msdos',      /* Typically used for EFI & FAT32 */
    TYPE_NTFS     : 'ntfs'
};

 /* ========================================================================
    Description:    Enumeration of supported conversion factors
    ======================================================================== */
export const CONVERSION_BASES = {
    BASE_2  : 2,
    BASE_10 : 10
};

/* ==========================================================================
   Class:              VolumeData
   Description:	       Provides data of interest for volumes.
   Copyright:          Dec 2020
   ========================================================================== */
export class VolumeData {
 /* ========================================================================
    Description:    Constructor

    @param {object} [data] - The settings to use for creating the object.
                             All fields are optional.
    @param {string} [data.name]                       - Name of the volume.
    @param {string} [data.disk_id]                    - Disk identifier of the volume.
    @param {VOLUME_TYPES | string} [data.volume_type] - File system type of the volume.
    @param {string} [data.mount_point]                - Mount point of the volume.
    @param {string} [data.device_node]                - Device node of the volume.
    @param {string} [data.volume_uuid]                - Unique identifier of the volume.
    @param {number} [data.capacity_bytes]             - Total size (in bytes) of the volume.
    @param {number} [data.free_space_bytes]           - Remaining space (in bytes) of the volume.
    @param {number} [data.used_space_bytes]           - Actively used space (in bytes) of the volume.
    @param {boolean} [data.visible]                   - Flag indicating that the volume is visible to the user.
                                                        (Shown in /Volumes)
    @param {boolean} [data.low_space_alert]           - Flag indicating that the low space alert threshold has
                                                        been exceeded.

    @return {object}  - Instance of the SpawnHelper class.

    @throws {TypeError}  - thrown if the configuration is not undefined.
    @throws {RangeError} - thrown if the configuration parameters are out of bounds.
    ======================================================================== */
    constructor(data) {

        // Initialize default values
        let name = undefined;
        let diskIdentifier = undefined;
        let volumeType = VOLUME_TYPES.TYPE_UNKNOWN;
        let mountPoint = undefined;
        let capacityBytes = 0;
        let deviceNode = undefined;
        let volumeUUID = undefined;
        let freeSpaceBytes = 0;
        let usedSpaceBytes = undefined;
        let visible = false;
        let lowSpaceAlert = false;

        // Update values from data passed in.
        if (data !== undefined) {
            if (typeof(data) != 'object') {
                throw new TypeError(`'data' must be an object`);
            }
            if (Object.prototype.hasOwnProperty.call(data, 'name') &&
                (typeof(data.name) === 'string')) {
                name = data.name;
            }
            if (Object.prototype.hasOwnProperty.call(data, 'disk_id') &&
                (typeof(data.disk_id) === 'string')) {
                diskIdentifier = data.disk_id;
            }
            if (Object.prototype.hasOwnProperty.call(data, 'volume_type') &&
                (typeof(data.volume_type) === 'string')) {
                if (Object.values(VOLUME_TYPES).includes(data.volume_type)) {
                    volumeType = data.volume_type;
                }
                else {
                    throw new RangeError(`Unrecognized volume type specified. (${data.volume_type})`);
                }
            }
            if (Object.prototype.hasOwnProperty.call(data, 'mount_point') &&
                (typeof(data.mount_point) === 'string')) {
                mountPoint = data.mount_point;
            }
            if (Object.prototype.hasOwnProperty.call(data, 'capacity_bytes') &&
                (typeof(data.capacity_bytes) === 'number')) {
                if (data.capacity_bytes >= 0) {
                    capacityBytes = data.capacity_bytes;
                }
                else {
                    throw new RangeError(`Volume capacity size must be greater than or equal to 0. (${data.capacity_bytes})`);
                }
            }
            if (Object.prototype.hasOwnProperty.call(data, 'device_node') &&
                (typeof(data.device_node) === 'string')) {
                deviceNode = data.device_node;
            }
            if (Object.prototype.hasOwnProperty.call(data, 'volume_uuid') &&
                (typeof(data.volume_uuid) === 'string')) {
                volumeUUID = data.volume_uuid;
            }
            if (Object.prototype.hasOwnProperty.call(data, 'free_space_bytes') &&
                (typeof(data.free_space_bytes) === 'number')) {
                if (data.free_space_bytes >= 0) {
                    freeSpaceBytes = data.free_space_bytes;
                }
                else {
                    throw new RangeError(`Volume free space size must be greater than or equal to 0. (${data.free_space_bytes})`);
                }
            }
            if (Object.prototype.hasOwnProperty.call(data, 'used_space_bytes') &&
                (typeof(data.used_space_bytes) === 'number')) {
                if (data.used_space_bytes >= 0) {
                    usedSpaceBytes = data.used_space_bytes;
                }
                else {
                    throw new RangeError(`Volume used space size must be greater than or equal to 0. (${data.used_space_bytes})`);
                }
            }
            if (Object.prototype.hasOwnProperty.call(data, 'visible') &&
                (typeof(data.visible) === 'boolean')) {
                visible = data.visible;
            }
            if (Object.prototype.hasOwnProperty.call(data, 'low_space_alert') &&
                (typeof(data.low_space_alert) === 'boolean')) {
                lowSpaceAlert = data.low_space_alert;
            }
        }

        // Initialize data members.
        this._name              = name;
        this._disk_identifier   = diskIdentifier;
        this._volume_type       = volumeType;
        this._mount_point       = mountPoint;
        this._capacity_bytes    = capacityBytes;
        this._device_node       = deviceNode;
        this._volume_uuid       = volumeUUID;
        this._free_space_bytes  = freeSpaceBytes;
        this._visible           = visible;
        this._low_space_alert   = lowSpaceAlert;
        if (usedSpaceBytes === undefined) {
            // Compute the used space as the difference between the capacity and free space.
            this._used_space_bytes  = (capacityBytes - freeSpaceBytes);
        }
        else {
            // Use the used space as provided.
            this._used_space_bytes = usedSpaceBytes
        }
        if (this._used_space_bytes < 0) {
            throw new RangeError(`Used space cannot be negative. ${this._used_space_bytes}`);
        }
    }

 /* ========================================================================
    Description: Read-Only Property accessor for the name of the volume.

    @return {string} - Name of the volume
    ======================================================================== */
    get Name() {
        return ( this._name );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for the disk identifier of the volume.

    @return {string} - Disk identifier of the volume
    ======================================================================== */
    get DiskId() {
        return ( this._disk_identifier );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for the file system of the volume.

    @return {VOLUME_TYPE(string)} - File system of the volume
    ======================================================================== */
    get VolumeType() {
        return ( this._volume_type );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for the mount point of the volume.

    @return {string} - Mount point of the volume. Undefined if not mounted.
    ======================================================================== */
    get MountPoint() {
        return ( this._mount_point );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for the device node of the volume.

    @return {string} - Device node of the volume.
    ======================================================================== */
    get DeviceNode() {
        return ( this._device_node );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for the UUID of the volume.

    @return {string} - Unique identifier of the volume.
    ======================================================================== */
    get VolumeUUID() {
        return ( this._volume_uuid );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for size (in bytes) of the volume.

    @return {number} - Size (in bytes) of the volume.
    ======================================================================== */
    get Size() {
        return ( this._capacity_bytes );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for free space (in bytes) of the volume.

    @return {number} - Free space (in bytes) of the volume.
    ======================================================================== */
    get FreeSpace() {
        return ( this._free_space_bytes );
    }

 /* ========================================================================
    Description: Read-Only Property accessor for used space (in bytes) of the volume.

    @return {number} - Used space (in bytes) of the volume

    @remarks - Excludes purgable space. Example APFS Snapshots.
    ======================================================================== */
    get UsedSpace() {
        return ( this._used_space_bytes );
    }

 /* ========================================================================
    Description: Read-Only Property accessor indicating if the volume is mounted.

    @return {bool} - true if the volume is mounted.
    ======================================================================== */
    get IsMounted() {
        return ((this._mount_point !== undefined) &&
                (this._mount_point.length > 0));
    }

 /* ========================================================================
    Description: Read-Only Property accessor indicating if the volume is visible
                 to the user (as determined by the contents of /Volumes).

    @return {bool} - true if the volume is visible.
    ======================================================================== */
    get IsVisible() {
        return ( this._visible );
    }

 /* ========================================================================
    Description: Read-Only Property accessor indicating if the low space alert
                 threshold has been exceeded.

    @return {bool} - true if the low space threshold has been exceeded.
    ======================================================================== */
    get LowSpaceAlert() {
        return ( this._low_space_alert );
    }

 /* ========================================================================
    Description: Read-Only Property accessor indicating the percentage of free space.

    @return {number} - percentage of space remaining (0...100)
    ======================================================================== */
    get PercentFree() {
        return ( (this.FreeSpace/this.Size)*100.0 );
    }

 /* ========================================================================
    Description:    Helper to convert from bytes to GB

    @param {number}                     [bytes] - Size in bytes to be converted
    @param {number | CONVERSION_BASES } [base] - Base to use for the conversion. (Optional. Default=CONVERSION_BASES.BASE_2)

    @return {number}  - Size in GB

    @throws {TypeError}  - thrown if the bytes or base is not a number
    @throws {RangeError} - thrown if the base is not valid.
    ======================================================================== */
    static ConvertFromBytesToGB(bytes, base) {
        if ((bytes === undefined) || (typeof(bytes) !== 'number')) {
            throw new TypeError(`'bytes' must be a number.`);
        }
        let convFactor = BYTES_TO_GB_BASE2;
        if (base !== undefined) {
            if (Object.values(CONVERSION_BASES).includes(base)) {
                if (CONVERSION_BASES.BASE_10 === base) {
                    convFactor = BYTES_TO_GB_BASE10;
                }
            }
            else {
                throw new RangeError(`'base' has an unsupported value. {${base}}`);
            }
        }

        return (bytes / convFactor);
    }

 /* ========================================================================
    Description:    Helper to convert from 1k Blocks to bytes

    @param {number} [blocks] - Number of 1k blocks.

    @return {number}  - Size in bytes

    @throws {TypeError}  - thrown if the blocks is not a number
    @throws {RangeError} - thrown if the blocks <= 0
    ======================================================================== */
    static ConvertFrom1KBlockaToBytes(blocks) {
        if ((blocks === undefined) || (typeof(blocks) !== 'number')) {
            throw new TypeError(`'blocks' must be a number.`);
        }
        if (blocks < 0) {
            throw new RangeError(`'blocks' must be a positive number. (${blocks})`);
        }

        return (blocks * BLOCK_1K_TO_BYTES);
    }
}
