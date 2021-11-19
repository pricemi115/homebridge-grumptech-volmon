/* ==========================================================================
   File:               volumeWatchers.js
   Class:              Volume Watcher for changes to files/folders.
   Description:        Watches files and folders for changes.
   Copyright:          Nov 2021
   ========================================================================== */

// External dependencies and imports.
import { access as _fsPromiseAccess } from 'fs/promises';
import { constants as _fsConstants, watch as _fsWatch } from 'fs';
import EventEmitter       from 'events';
// eslint-disable-next-line camelcase
const _debug_process    = require('debug')('vi_process');
// eslint-disable-next-line camelcase, no-unused-vars
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
export const VOLUME_WATCHER_EVENTS = {
    /* eslint-disable key-spacing */
    EVENT_CHANGE_DETECTED   : 'change_detected',
    EVENT_WATCH_ADD_RESULT  : 'watch_add_result',
    /* eslint-enable key-spacing */
};

/* ==========================================================================
   Class:              VolumeWatcher
   Description:        Monitors the file system for changes to files/folders.
   Copyright:          Nov 2021

   @event 'change_detected'     => function({object})
   @event 'watch_add_result'    => function({string, boolean})
    ========================================================================== */
export class VolumeWatcher extends EventEmitter {
/*  ========================================================================
    Description:    Constructor

    @return {object}  - Instance of the VolumeWatcher class.
    ======================================================================== */
    constructor() {
        // Initialize the base class.
        super();

        // Initialize data members.
        this._timeoutID = INVALID_TIMEOUT_ID;

        // Map of watched folders.
        this._watchers = new Map();

        // Callbacks bound to this object.
        this._CB__VolumeWatcherChange = this._handleVolumeWatcherChangeDetected.bind(this);
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

        // Clean up event registrations.
        this.removeAllListeners(VOLUME_WATCHER_EVENTS.EVENT_CHANGE_DETECTED);
        this.removeAllListeners(VOLUME_WATCHER_EVENTS.EVENT_WATCH_ADD_RESULT);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Add or replace file system objects to be monitored

    @param { [object] } [watchList]                - Array of objects containing the watch information.
    @param { string  }  [watchList[n].target]      - Path of the target to be watched.
    @param { boolena }  [watchList[n].recursive]   - (Optional) Flag indicating that the target should be
                                                      recursed for change monitoring (if a directory)
                                                      ** Note: Not supported on all operating systems.
    @param { boolena }  [watchList[n].ignoreAccess]- (Optional) Flag indicating that the access to the target
                                                      should be ignored.

    @return { Promise } - A promise that when resolved will indicate if the watch targets were added.

    #throw { TypeError } - Thrown if 'watchList' does is not an array of objects.

    @remarks - Raises the 'watch_add_result' event as each item is processed.
    ======================================================================== */
    async AddWatches(watchList) {
        // Validate the arguments
        if ((watchList === undefined)  ||
            (!Array.isArray(watchList) ||
            (watchList.length <= 0))) {
            throw new TypeError('\'watchList\' is not a non-zero length array.');
        }
        else {
            // Ensure that the array contents are all objects containing a 'target' field.
            for (const watchItem of watchList) {
                if ((!Object.prototype.hasOwnProperty.call(watchItem, 'target')) ||
                    (typeof(watchItem.target) !== 'string') ||
                    (watchItem.target.length <= 0)) {
                    throw new TypeError('\'watchList\' item does not contain a field \'target\' or \'target\' is not a non-null string.');
                }
            }
        }
        // Body -----------------

        // construct a promise for this operation.
        const thePromise = new Promise((resolve) => {
            (async (theList) => {
                // Assume success. Set false on any issue.
                let success = true;

                // Iterate over the list of watch items and determine the file access.
                const accessPromises = [];
                for (const watchItem of theList) {
                    accessPromises.push(this.ValidateAccess(watchItem.target, _fsConstants.F_OK));
                }
                // Wait until all of the promises have been servided.
                const accessResults = await Promise.all(accessPromises);

                // iterate over the list of watch items to set up watches for the ones which have access.
                for (const watchItem of theList) {
                    // No need to validate the 'target' field, as this was done initially.
                    let recurse         = false;
                    let ignoreAccess    = false;
                    // Use the recursive flag, if present & valid
                    if ((Object.prototype.hasOwnProperty.call(watchItem, 'recursive')) &&
                        (typeof(watchItem.recursive) === 'boolean')) {
                        recurse = watchItem.recursive;
                    }
                    // Use the ignore access flag, if present & valid
                    if ((Object.prototype.hasOwnProperty.call(watchItem, 'ignoreAccess')) &&
                        (typeof(watchItem.ignoreAccess) === 'boolean')) {
                        ignoreAccess = watchItem.ignoreAccess;
                    }

                    // Determine if the process has access to the target of watchItem
                    let accessOk = false;
                    let found = false;
                    for (const accessResult of accessResults) {
                        if (accessResult.target === watchItem.target) {
                            accessOk = accessResult.success;
                            found = true;
                            // No need to continue the search.
                            break;
                        }
                    }
                    // Sanity
                    if (!found) {
                        // This should never happen.
                        throw new Error(`target:${watchItem} not found in 'accessResults'`);
                    }

                    const watchOk = (accessOk || ignoreAccess);
                    if (watchOk) {
                        // Determine if this target is already being watched.
                        const exists = this._watchers.has(watchItem.target);

                        _debug_process(`Watch target: '${watchItem.target}' accessOk:${accessOk} exists:${exists}`);

                        // If a watch already exists, clean up first.
                        if (exists) {
                            this.DeleteWatch(watchItem.target);
                        }

                        // Initiate the watch.
                        const watcher = _fsWatch(watchItem.target, { persistent: true, recursive: recurse, encoding: 'utf8' }, this._CB__VolumeWatcherChange);
                        // Update the map of watchers.
                        this._watchers.set(watchItem.target, watcher);
                    }
                    else {
                        _debug_process(`Unable to watch target: '${watchItem.target}`);
                        success = false;
                    }

                    // Notify clients
                    this.emit(VOLUME_WATCHER_EVENTS.EVENT_WATCH_ADD_RESULT, { target: watchItem.target, success: watchOk });
                }

                resolve(success);
            })(watchList);
        });

        return thePromise;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Delete a watch

    @param { string }  [target] - Path of the watch to be removed.

    @return { boolean } - true if watchItem was deleted.
    ======================================================================== */
    DeleteWatch(target) {
        let success = false;

        // Attempt to get the watch matching the target.
        const watchItem = this._watchers.get(target);
        if (watchItem !== undefined) {
            // Stop watching.
            watchItem.close();
            // Remove the entry.
            success = this._watchers.delete(target);
        }

        return success;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Provide a list of the watch targets

    @return { [string]] } - Array of the watch targets
    ======================================================================== */
    ListWatches() {
        const targets = [];

        // Attempt to get the watch matching the target.
        const iter = this._watchers.keys();
        for (const watchTarget of iter) {
            targets.push(watchTarget);
        }

        return targets;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Check to see if the current process has access to the specified target.

    @param { string }  [target]     - File system target.
    @param { enum }    [accessMode] - Mode for the access being sought.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    async ValidateAccess(target, accessMode) {
        // Validate the arguments.
        if ((target === undefined) || (target === null) ||
            (typeof(target) !== 'string') || (target.length < 1)) {
            throw new TypeError('\'target\' is not a non-zero string.');
        }
        if ((accessMode === undefined) || (accessMode === null) ||
            (typeof(accessMode) !== 'number')) {
            throw new TypeError('\'accessMode\' is not a number');
        }
        // Body ------------
        const thePromise = new Promise((resolve) => {
            (async (loc, mode) => {
                try {
                    await _fsPromiseAccess(loc, mode);
                    resolve({ target: loc, success: true });
                }
                catch {
                    resolve({ target: loc, success: false });
                }
            })(target, accessMode);
        });

        return thePromise;
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
            this.emit(VOLUME_WATCHER_EVENTS.EVENT_CHANGE_DETECTED, eType, fName);
        }, eventType, fileName);
    }
}
export default VolumeWatcher;
