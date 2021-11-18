/* ==========================================================================
   File:               volumeWatchers.js
   Class:              Volume Watcher for changes to files/folders.
   Description:        Watches files and folders for changes.
   Copyright:          Nov 2021
   ========================================================================== */

// External dependencies and imports.
import * as modFileSystem from 'fs';
import EventEmitter       from 'events';
// eslint-disable-next-line camelcase
const _debug_process    = require('debug')('vi_process');
// eslint-disable-next-line camelcase
const _debug_config     = require('debug')('vi_config');

// Helpful constants and conversion factors.
const INVALID_TIMEOUT_ID = -1;
const RESCAN_PERIOD_MS   = 60000/* milliseconds */;

// Volume Change Detection Bitmask Definition
export const VOLUME_CHANGE_DETECTION_BITMASK_DEF = {
    /* eslint-disable key-spacing */
    Add    : 0x1,
    Delete : 0x2,
    Modify : 0x4,
    /* eslint-enable key-spacing */
};

// Published events
export const VOLUME_CHANGE_DETECTION_EVENTS = {
    EVENT_CHANGE_DETECTED: 'change_detected',
};

/* ==========================================================================
   Class:              VolumeWatcher
   Description:        Monitors the file system for changes to files/folders.
   Copyright:          Nov 2021

   @event 'change_detected' => function({object})
   @event_param {<VolumeData>}  [results]  - Array of volume data results.
   Event emmitted when the (periodic) interrogation is completes.
   ========================================================================== */
export class VolumeWatcher extends EventEmitter {
/*  ========================================================================
    Description:    Constructor

    @param {object}     [config]                         - The settings to use for creating the
                                                           object (Optional)
    @param {[object]}   [config.watch_list]              - List of file system objects to monitor
                                                           for changes.
    @param {string}     [config.watch_list.target]       - The file/folder name to be monitored.
    @param {boolean}    [config.watch_list.recursive]    - Indicates that the subdirectories should
                                                           be monitored.
                                                           Note: not available on all operating.
                                                                 systems (Default: false)
    @param {boolean}    [config.watch_list.ignoreAccess] - Flag indicating that the target should
                                                           ignore access issues. (default: false)

    @return {object}  - Instance of the VolumeWatcher class.
    ======================================================================== */
    constructor(config) {
        // Initialize the base class.
        super();

        // Initialize data members.
        this._timeoutID = INVALID_TIMEOUT_ID;

        // Map of watched folders.
        this._watchers = new Map();

        // Callbacks bound to this object.
        this._CB__VolumeWatcherChange = this._handleVolumeWatcherChangeDetected.bind(this);

        // Process the configuration (if any). If configuration settings are incorrect,
        // they will be ignored.
        if ((config !== undefined) &&
            (Object.prototype.hasOwnProperty.call(config, 'watch_list')) &&
            (Array.isArray(config.watch_list))) {
            for (const watchItem of config.watch_list) {
                if ((Object.prototype.hasOwnProperty.call(watchItem, 'target')) &&
                    (typeof(watchItem.target) === 'string') && (watchItem.target.length > 0)) {
                    let recurse         = false;
                    let ignoreAccess    = false;
                    if ((Object.prototype.hasOwnProperty.call(watchItem, 'recursive')) &&
                        (typeof(watchItem.recursive) === 'boolean')) {
                        recurse = watchItem.recursive;
                    }
                    if ((Object.prototype.hasOwnProperty.call(watchItem, 'ignoreAccess')) &&
                        (typeof(watchItem.ignoreAccess) === 'boolean')) {
                        ignoreAccess = watchItem.ignoreAccess;
                    }
                    modFileSystem.access(watchItem.target, modFileSystem.constants.F_OK, (err) => {
                        if (!err || ignoreAccess) {
                            _debug_config(`Watch target: '${watchItem.target}' err:'${(err ? err.toString() : 'No error')}'`);
                            const watcher = modFileSystem.watch(watchItem.target, { persistent: true, recursive: recurse, encoding: 'utf8' }, this._CB__VolumeWatcherChange);
                            this._watchers.set(watchItem.target, watcher);
                        }
                        else {
                            _debug_config(`Unable to watch target: '${watchItem.target} err:'${err.toString()}`);
                        }
                    });
                }
            }
        }
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Destuctor
    ======================================================================== */
    Terminate() {
        // Cleanup the volume watcher list.
        this._watchers.forEach((value, key) => {
            _debug_process(`Volume Watcher closing target '${key}`);
            value.close();
        });
        this._watchers.clear();

        this.removeAllListeners(VOLUME_CHANGE_DETECTION_EVENTS.EVENT_CHANGE_DETECTED);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Event handler for file system change detections.

    @param { string }           [eventType] - Type of change detected ('rename' or 'change')
    @param { string | Buffer }  [fileName]  - Name of the file or directory with the change.
    ======================================================================== */
    AddWatch() {

    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Event handler for file system change detections.

    @param { string }           [eventType] - Type of change detected ('rename' or 'change')
    @param { string | Buffer }  [fileName]  - Name of the file or directory with the change.
    ======================================================================== */
    _handleVolumeWatcherChangeDetected(eventType, fileName) {
        // Decouple the automatic refresh.
        setImmediate((eType, fName) => {
            _debug_process(`Volume Watcher Change Detected: type:${eType} name:${fName}`);

            // For simplicity, forward the event onto out clients.
            this.emit(VOLUME_CHANGE_DETECTION_EVENTS.EVENT_CHANGE_DETECTED, eType, fName);
        }, eventType, fileName);
    }
}
export default VolumeWatcher;
