'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var _debugModule = require('debug');
var promises = require('fs/promises');
var fs = require('fs');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var _debugModule__default = /*#__PURE__*/_interopDefaultLegacy(_debugModule);

var config_info = {
	remarks: [
		"The 'plugin' and 'platform' names MUST match the names called out in the 'platforms' section of the active config.json file.",
		"If these values are changed, the module will need to be rebuilt. Run 'npm run build'."
	],
	plugin: "homebridge-grumptech-volmon",
	platform: "GrumpTechVolumeMonitorPlatform"
};

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}

// nodejs oddity
// require('events') === require('events').EventEmitter
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active ) ;
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] :
                                          [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + type + ' listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = new EventHandlers();
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = new EventHandlers();
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = new EventHandlers();
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = new EventHandlers();
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener.listener || evlistener];
    else
      ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

var global$1 = (typeof global !== "undefined" ? global :
  typeof self !== "undefined" ? self :
  typeof window !== "undefined" ? window : {});

/*
The MIT License (MIT)

Copyright (c) 2016 CoderPuppy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
var _endianness;
function endianness() {
  if (typeof _endianness === 'undefined') {
    var a = new ArrayBuffer(2);
    var b = new Uint8Array(a);
    var c = new Uint16Array(a);
    b[0] = 1;
    b[1] = 2;
    if (c[0] === 258) {
      _endianness = 'BE';
    } else if (c[0] === 513){
      _endianness = 'LE';
    } else {
      throw new Error('unable to figure out endianess');
    }
  }
  return _endianness;
}

function hostname() {
  if (typeof global$1.location !== 'undefined') {
    return global$1.location.hostname
  } else return '';
}

function loadavg() {
  return [];
}

function uptime() {
  return 0;
}

function freemem() {
  return Number.MAX_VALUE;
}

function totalmem() {
  return Number.MAX_VALUE;
}

function cpus() {
  return [];
}

function type() {
  return 'Browser';
}

function release () {
  if (typeof global$1.navigator !== 'undefined') {
    return global$1.navigator.appVersion;
  }
  return '';
}

function networkInterfaces(){}
function getNetworkInterfaces(){}

function tmpDir() {
  return '/tmp';
}
var tmpdir = tmpDir;

var EOL = '\n';
var _osModule = {
  EOL: EOL,
  tmpdir: tmpdir,
  tmpDir: tmpDir,
  networkInterfaces:networkInterfaces,
  getNetworkInterfaces: getNetworkInterfaces,
  release: release,
  type: type,
  cpus: cpus,
  totalmem: totalmem,
  freemem: freemem,
  uptime: uptime,
  loadavg: loadavg,
  hostname: hostname,
  endianness: endianness,
};

/**
 * @description Provides read/write access to data metrics of interest.
 * @copyright December 2020
 * @author Mike Price <dev.grumptech@gmail.com>
 * @module VolumeDataModule
 * @requires debug
 * @see {@link https://github.com/debug-js/debug#readme}
 */

/**
 * @description Debugging function pointer for runtime related diagnostics.
 * @private
 */
const _debug$2 = new _debugModule__default["default"]('vol_data');

// Bind debug to console.log
// eslint-disable-next-line no-console
_debug$2.log = console.log.bind(console);

// Helpful constants and conversion factors.
/**
 * @description Factor for converting from bytes to gigabytes (base-2)
 * @type {number}
 * @private
 */
const BYTES_TO_GB_BASE2     = (1024.0 * 1024.0 * 1024.0);
/**
 * @description Factor for converting from bytes to gigabytes (base-10)
 * @type {number}
 * @private
 */
const BYTES_TO_GB_BASE10    = (1000.0 * 1000.0 * 1000.0);
/**
 * @description Factor for converting from kilobytes to bytes (base-2)
 * @type {number}
 * @private
 */
const BLOCK_1K_TO_BYTES     = 1024.0;

/**
 * @description Enumeration of volume types (file systems).
 * @readonly
 * @enum {string}
 * @property {string} TYPE_UNKNOWN - Unknown volume type
 * @property {string} TYPE_HFS_PLUS - HGS Plus volume (legacy Apple file system)
 * @property {string} TYPE_APFS - APFS vvolume (current Apple file system)
 * @property {string} TYPE_UDF - Universal Disk Format (ISO, etc)
 * @property {string} TYPE_MSDOS - Legacy volume (Typically used for EFI & FAT32)
 * @property {string} TYPE_NTFS - Windows volume
 * @property {string} TYPE_SMBFS - Server Message Block volume (Remote File Share)
 * @property {string} TYPE_EXT4 - Linux volume
 * @property {string} TYPE_VFAT - Linux volume
 */
const VOLUME_TYPES = {
    /* eslint-disable key-spacing */
    TYPE_UNKNOWN  : 'unknown',
    TYPE_HFS_PLUS : 'hfs',
    TYPE_APFS     : 'apfs',
    TYPE_UDF      : 'udf',
    TYPE_MSDOS    : 'msdos',
    TYPE_NTFS     : 'ntfs',
    TYPE_SMBFS    : 'smbfs',
    TYPE_EXT4     : 'ext4',
    TYPE_VFAT     : 'vfat',
    /* eslint-enable key-spacing */
};

/**
 * @description Enumeration of supported conversion factors
 * @readonly
 * @enum {number}
 * @property {number} BASE_2- Two's complement conversion factor.
 * @property {number} BASE_10 - Base 10 conversion factor.
 */
const CONVERSION_BASES = {
    /* eslint-disable key-spacing */
    BASE_2  : 2,
    BASE_10 : 10,
    /* eslint-enable key-spacing */
};

/**
 * @description Provides data of interest for volumes.
 */
class VolumeData {
    /**
     * @description Constructor
     * @class
     * @param {object} [data] - The settings to use for creating the object.
     * @param {string} [data.name] - Name of the volume.
     * @param {string} [data.disk_id] - Disk identifier of the volume.
     * @param {VOLUME_TYPES | string} [data.volume_type] - File system type of the volume.
     * @param {string} [data.mount_point] - Mount point of the volume.
     * @param {string} [data.device_node] - Device node of the volume.
     * @param {string} [data.volume_uuid] - Unique identifier of the volume.
     * @param {number} [data.capacity_bytes] - Total size (in bytes) of the volume.
     * @param {number} [data.free_space_bytes] - Remaining space (in bytes) of the volume.
     * @param {number} [data.used_space_bytes] - Actively used space (in bytes) of the volume.
     * @param {boolean} [data.visible] - Flag indicating that the volume is visible to the user.
     * @param {boolean} [data.shown] - Flag indicating that the volume should be shown.
     * @param {boolean} [data.low_space_alert] - Flag indicating that the low space alert threshold has been exceeded.
     * @throws {TypeError}  - thrown if the configuration item is not the expected type.
     * @throws {RangeError} - thrown if the configuration parameters are out of bounds.
     */
    constructor(data) {
        // Initialize default values
        let name;
        let diskIdentifier;
        let volumeType = VOLUME_TYPES.TYPE_UNKNOWN;
        let mountPoint;
        let capacityBytes = 0;
        let deviceNode;
        let volumeUUID;
        let freeSpaceBytes = 0;
        let usedSpaceBytes;
        let visible = false;
        let shown = false;
        let lowSpaceAlert = false;

        // Update values from data passed in.
        if (data !== undefined) {
            if (typeof(data) !== 'object') {
                throw new TypeError('\'data\' must be an object');
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
            if (Object.prototype.hasOwnProperty.call(data, 'shown') &&
                (typeof(data.shown) === 'boolean')) {
                shown = data.shown;
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
        this._shown             = shown;
        this._low_space_alert   = lowSpaceAlert;
        if (usedSpaceBytes === undefined) {
            // Compute the used space as the difference between the capacity and free space.
            this._used_space_bytes  = (capacityBytes - freeSpaceBytes);
        }
        else {
            // Use the used space as provided.
            this._used_space_bytes = usedSpaceBytes;
        }
        if (this._used_space_bytes < 0) {
            throw new RangeError(`Used space cannot be negative. ${this._used_space_bytes}`);
        }
    }

    /**
     * @description Read-only property accessor for the name of the volume
     * @returns {string} - Name of the volume
     */
    get Name() {
        return (this._name);
    }

    /**
     * @description Read-only property accessor for the disk identifier of the volume.
     * @returns {string} - Disk identifier of the volume
     */
    get DiskId() {
        return (this._disk_identifier);
    }

    /**
     * @description Read-only property accessor for the file system of the volume.
     * @returns {VOLUME_TYPES} - File system of the volume
     */
    get VolumeType() {
        return (this._volume_type);
    }

    /**
     * @description Read-Only Property accessor for the mount point of the volume.
     * @returns {string} - Mount point of the volume. Undefined if not mounted.
     */
    get MountPoint() {
        return (this._mount_point);
    }

    /**
     * @description Read-Only Property accessor for the device node of the volume.
     * @returns {string} - Device node of the volume.
     */
    get DeviceNode() {
        return (this._device_node);
    }

    /**
     * @description Read-Only Property accessor for the UUID of the volume.
     * @returns {string} - Unique identifier of the volume.
     */
    get VolumeUUID() {
        return (this._volume_uuid);
    }

    /**
     * @description Read-Only Property accessor for the size (in bytes) of the volume.
     * @returns {number} - Size (in bytes) of the volume.
     */
    get Size() {
        return (this._capacity_bytes);
    }

    /**
     * @description Read-Only Property accessor for free space (in bytes) of the volume.
     * @returns {number} - Free space (in bytes) of the volume.
     */
    get FreeSpace() {
        return (this._free_space_bytes);
    }

    /**
     * @description Read-Only Property accessor for used space (in bytes) of the volume.
     * @returns {number} - Used space (in bytes) of the volume. Excludes purgable space. Example APFS Snapshots.
     */
    get UsedSpace() {
        return (this._used_space_bytes);
    }

    /**
     * @description Read-Only Property accessor indicating if the volume is mounted.
     * @returns {boolean} - true if the volume is mounted.
     */
    get IsMounted() {
        return ((this._mount_point !== undefined) &&
                (this._mount_point.length > 0));
    }

    /**
     * @description Read-Only Property accessor indicating if the volume is visible to the user.
     * @returns {boolean} - true if the volume is visible.
     */
    get IsVisible() {
        return (this._visible);
    }

    /**
     * @description Read-Only Property accessor indicating if the low space alert threshold has been exceeded.
     * @returns {boolean} - true if the low space threshold has been exceeded.
     */
    get LowSpaceAlert() {
        return (this._low_space_alert);
    }

    /**
     * @description Read-Only Property accessor indicating the percentage of free space.
     * @returns {number} - percentage of space remaining (0...100)
     */
    get PercentFree() {
        return ((this.FreeSpace / this.Size) * 100.0);
    }

    /**
     * @description Read-Only Property accessor indicating is the volume should be shown.
     * @returns {boolean} - true if the volume should be shown.
     */
    get IsShown() {
        return (this._shown);
    }

    /**
     * @description Helper to determine if the supplied object is equivalent to this one.
     * @param {object} compareTarget - Object used as the target or the comparison.
     * @returns {boolean} -  true if the supplied object is a match. false otherwise.
     */
    IsMatch(compareTarget) {
        /* eslint-disable indent, space-in-parens */
                          // Ensure 'compareTarget' is indeed an instance of VolumeData.
        const result = (  (compareTarget instanceof VolumeData) &&
                          // A subset of the volume data properties are used to establish
                          // equivalence.
                          (this.Name === compareTarget.Name) &&
                          (this.VolumeType === compareTarget.VolumeType) &&
                          (this.DeviceNode === compareTarget.DeviceNode) &&
                          (this.MountPoint === compareTarget.MountPoint)   );
       /* eslint-enable indent, space-in-parens */

        return (result);
    }

    /**
     * @description Helper to convert from bytes to GB
     * @param {number} bytes - Size in bytes to be converted
     * @param {number | CONVERSION_BASES} [base] - Base to use for the conversion.
                                                 (Default=CONVERSION_BASES.BASE_2)
     * @returns {number} - Size in GB
     * @throws {TypeError}  - thrown if the bytes or base is not a number
     * @throws {RangeError} - thrown if the base is not valid.
     */
    static ConvertFromBytesToGB(bytes, base) {
        if ((bytes === undefined) || (typeof(bytes) !== 'number')) {
            throw new TypeError('\'bytes\' must be a number.');
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

    /**
     * @description Helper to convert from 1k Blocks to bytes
     * @param {number} blocks - Number of 1k blocks.
     * @returns {number} - Size in bytes
     * @throws {TypeError}  - thrown if the blocks is not a number
     * @throws {RangeError} - thrown if the blocks <= 0
     */
    static ConvertFrom1KBlockaToBytes(blocks) {
        if ((blocks === undefined) || (typeof(blocks) !== 'number')) {
            throw new TypeError('\'blocks\' must be a number.');
        }
        if (blocks < 0) {
            throw new RangeError(`'blocks' must be a positive number. (${blocks})`);
        }

        return (blocks * BLOCK_1K_TO_BYTES);
    }
}

/* ==========================================================================
   File:               volumeWatchers.js
   Class:              Volume Watcher for changes to files/folders.
   Description:        Watches files and folders for changes.
   Copyright:          Nov 2021
   ========================================================================== */
// eslint-disable-next-line camelcase
const _debug_process$3    = require('debug')('vi_process');
// eslint-disable-next-line camelcase, no-unused-vars
require('debug')('vi_config');

// Helpful constants and conversion factors.
const INVALID_TIMEOUT_ID$1 = -1;

// Published events
const VOLUME_WATCHER_EVENTS = {
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
class VolumeWatcher extends EventEmitter {
/*  ========================================================================
    Description:    Constructor

    @return {object}  - Instance of the VolumeWatcher class.
    ======================================================================== */
    constructor() {
        // Initialize the base class.
        super();

        // Initialize data members.
        this._timeoutID = INVALID_TIMEOUT_ID$1;

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
            _debug_process$3(`Volume Watcher closing target '${key}`);
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
                    accessPromises.push(this.ValidateAccess(watchItem.target, fs.constants.F_OK));
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

                        _debug_process$3(`Watch target: '${watchItem.target}' accessOk:${accessOk} exists:${exists}`);

                        // If a watch already exists, clean up first.
                        if (exists) {
                            this.DeleteWatch(watchItem.target);
                        }

                        // Initiate the watch.
                        const watcher = fs.watch(watchItem.target, { persistent: true, recursive: recurse, encoding: 'utf8' }, this._CB__VolumeWatcherChange);
                        // Update the map of watchers.
                        this._watchers.set(watchItem.target, watcher);
                    }
                    else {
                        _debug_process$3(`Unable to watch target: '${watchItem.target}`);
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
                    await promises.access(loc, mode);
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
            _debug_process$3(`Volume Watcher Change Detected: type:${eType} name:${fName}`);

            // For simplicity, forward the event onto out clients.
            this.emit(VOLUME_WATCHER_EVENTS.EVENT_CHANGE_DETECTED, eType, fName);
        }, eventType, fileName);
    }
}

/**
 * @description Controls the collection of volume specific information and attributes to be published to homekit.
 * @copyright December 2020
 * @author Mike Price <dev.grumptech@gmail.com>
 * @module VolumeInterrogatorBaseModule
 * @requires debug
 * @see {@link https://github.com/debug-js/debug#readme}
 * @requires events
 * @see {@link https://nodejs.org/dist/latest-v16.x/docs/api/events.html#events}
 */

// External dependencies and imports.
/**
 * @description Debugging function pointer for runtime related diagnostics.
 * @private
 */
// eslint-disable-next-line camelcase
const _debug_process$2    = new _debugModule__default["default"]('vi_process');
/**
 * @description Debugging function pointer for configuration related diagnostics.
 * @private
 */
// eslint-disable-next-line camelcase
const _debug_config$2     = new _debugModule__default["default"]('vi_config');
/**
 * @description Reference to the operating system functionality.
 * @private
 */
const _os$1               = new _osModule();

// Bind debug to console.log
// eslint-disable-next-line no-console, camelcase
_debug_process$2.log = console.log.bind(console);
// eslint-disable-next-line no-console, camelcase
_debug_config$2.log  = console.log.bind(console);

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

/* ==========================================================================
   Class:              VolumeInterrogator
   Description:        Manager for interrogating volumes on the system
   Copyright:          Dec 2020

   @event 'ready' => function({object})
   @event_param {<VolumeData>}  [results]  - Array of volume data results.
   Event emmitted when the (periodic) interrogation is completes.

   @event 'scanning' => function({object})
   Event emmitted when a refresh/rescan is initiated.
   ========================================================================== */
/**
 * @description Scanning initiated notification
 * @event module:VolumeInterrogatorBaseModule#event:scanning
 */
/**
 * @description Volume detection ready notification
 * @event module:VolumeInterrogatorBaseModule#event:ready
 * @type {object} e - Event notification payload.
 * @param {VolumeData} e.results - Flag indicating if the spawned task completed successfully.
 * @param {Buffer} e.result - Buffer of result or error data returned by the spawned process.
 * @param {SpawnHelper} e.source - Reference to the spawn helper that raised the notification.
 */
/**
 * @description Base class for volume interrogation (operating system agnostic).
 */
class VolumeInterrogatorBase extends EventEmitter {
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
        this._volWatcher = new VolumeWatcher();
        this._volWatcher.on(VOLUME_WATCHER_EVENTS.EVENT_CHANGE_DETECTED,  this._CB__VolumeWatcherChange);
        this._volWatcher.on(VOLUME_WATCHER_EVENTS.EVENT_WATCH_ADD_RESULT, this._CB__VolumeWatcherAdded);
        // Add watches for the locations of interest.
        // Note: This is asynchronous and will be happening after the constructor completes.
        this._volWatcher.AddWatches(watcherConfig);
    }

    /**
     * @description Destructor
     * @returns {void}
     */
    Terminate() {
        this.Stop();

        // Cleanup the volume watcher
        this._volWatcher.Terminate();

        this.removeAllListeners(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_SCANNING);
        this.removeAllListeners(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Read Property accessor for the polling period (hours)

    @return {number} - Polling period in hours.
    ======================================================================== */
    get Period() {
        return this._period_hr;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Write Property accessor for the polling period (hours)

    @param {number} [periodHR] - Polling period in hours.

    @throws {TypeError}  - thrown if 'periodHR' is not a number.
    @throws {RangeError} - thrown if 'periodHR' outside the allowed bounds.
    ======================================================================== */
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
        this.Stop();
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Read Property accessor for the minimum polling period (hours)

    @return {number} - Minimum polling period in hours.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    get MinimumPeriod() {
        return MIN_PERIOD_HR;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Read Property accessor for the maximum polling period (hours)

    @return {number} - Maximum polling period in hours.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    get MaximumPeriod() {
        return MAX_PERIOD_HR;
    }

    // eslint-disable-next-line indent
  /* ========================================================================
    Description: Read Property accessor for indicating if the checking of volume data is active

    @return {boolean} - true if active.
    ======================================================================== */
    get Active() {
        return (this._timeoutID !== INVALID_TIMEOUT_ID);
    }

    // eslint-disable-next-line indent
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
        const uptime = _os$1.uptime() * 1000.0;
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

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Stop the interrogation process, if running.
    ======================================================================== */
    Stop() {
        if (this._timeoutID !== INVALID_TIMEOUT_ID) {
            clearTimeout(this._timeoutID);
            this._timeoutID = INVALID_TIMEOUT_ID;
        }
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Helper function used to reset an ongoing check.

    @param {boolean} [issueReady] - Flag indicating if a Ready event should be emitted.

    @remarks: Used to recover from unexpected errors.
    ======================================================================== */
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

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Helper function used to initiate an interrogation of the
                 system volumes.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _on_initiateCheck() {
        // Is there a current volume check underway?
        const isPriorCheckInProgress = this._checkInProgress;

        _debug_process$2(`_on_initiateCheck(): Initiating a scan. CheckInProgress=${isPriorCheckInProgress}`);

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

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Abstract method used to initiate interrogation on derived classes.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    _initiateInterrogation() {
        throw new Error('Abstract Method _initiateInterrogation() invoked!');
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Abstract method used to reset an interrogation.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    _doReset() {
        throw new Error('Abstract Method _doReset() invoked!');
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Abstract property used to determine if a check is in progress.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    get _isCheckInProgress() {
        throw new Error('Abstract Property _checkInProgress() invoked!');
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Abstract property used to get an array of watch folders
                    used to initiate an interrogation.

    @throws {Error} - Always thrown. Should only be invoked on derived classes.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    get _watchFolders() {
        throw new Error('Abstract Property _watchFolders() invoked!');
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Helper for managing the "in progress" flag and 'ready' event
    ======================================================================== */
    _updateCheckInProgress() {
        const wasCheckInProgress = this._checkInProgress;
        this._checkInProgress = this._isCheckInProgress;
        if (wasCheckInProgress && !this._checkInProgress) {
            // Fire Ready event
            this.emit(VOLUME_INTERROGATOR_BASE_EVENTS.EVENT_READY, {results: this._theVolumes});

            _debug_process$2('Ready event.');
            for (const volume of this._theVolumes) {
                _debug_process$2(`Volume Name: ${volume.Name}`);
                _debug_process$2(`\tVisible:    ${volume.IsVisible}`);
                _debug_process$2(`\tShown:      ${volume.IsShown}`);
                _debug_process$2(`\tMountPoint: ${volume.MountPoint}`);
                _debug_process$2(`\tDevNode:    ${volume.DeviceNode}`);
                _debug_process$2(`\tCapacity:   ${VolumeData.ConvertFromBytesToGB(volume.Size).toFixed(4)} GB`);
                _debug_process$2(`\tFree:       ${VolumeData.ConvertFromBytesToGB(volume.FreeSpace).toFixed(4)} GB`);
                _debug_process$2(`\tUsed:       ${VolumeData.ConvertFromBytesToGB(volume.UsedSpace).toFixed(4)} GB`);
                _debug_process$2(`\t% Used:     ${((volume.UsedSpace / volume.Size) * 100.0).toFixed(2)}%`);
            }
        }
    }

    // eslint-disable-next-line indent
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

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Event handler for file system change detections.
                  Called when the contents of the watched folder(s) change(s).

    @param { string }           [eventType] - Type of change detected ('rename' or 'change')
    @param { string | Buffer }  [fileName]  - Name of the file or directory with the change.
    ======================================================================== */
    _handleVolumeWatcherChangeDetected(eventType, fileName) {
        // Decouple the automatic refresh.
        setImmediate((eType, fName) => {
            _debug_process$2(`Volume Watcher Change Detected: type:${eType} name:${fName} active:${this.Active} chkInProgress:${this._checkInProgress}`);
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

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Event handler for file system change detections.
                  Called when the contents of the watched folder(s) change(s).

    @param { object }  [result]         - Result of the request to add a watcher.
    @param { string }  [result.target]  - Target of the watch
    @param { boolean } [result.success] - Status of the add operation.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    _handleVolumeWatcherAdded(result) {
        if (result !== undefined) {
            _debug_process$2(`AddWatch Results: target:${result.target} status:${result.success}`);
        }
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Helper to determine if the volume should be shown or not.

    @param { string } [mountPoint] - Mount Point of the volume

    #return { boolena } - True if shown. False otherwise.

    @throws { TypeError } - thrown if mountPoint is not a non-null string.
    ======================================================================== */
    _isVolumeShown(mountPoint) {
        if ((mountPoint === undefined) ||
            (typeof(mountPoint) !== 'string') || (mountPoint.length <= 0)) {
            throw new TypeError(`_isVolumeShown. mountPoint is not valid. ${mountPoint}`);
        }

        let isShown = true;
        for (const mask of this._exclusionMasks) {
            _debug_process$2(`Evaluating exclusion mask '${mask}' for mount point '${mountPoint}'`);
            const reMask = new RegExp(mask);
            const matches = mountPoint.match(reMask);
            _debug_process$2(matches);
            isShown = isShown && (matches === null);
        }

        return isShown;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Helper to evaluate the validity of the custom configuration settings.

    @param { object }   [custom_config]                        - Custom per-volume configuration
                                                                 settings.
    @param { string }   [config.volume_id_method]              - The method for identifying the
                                                                 volume.
    @param { string }   [config.volume_name]                   - The name of the volume.
                                                                 (required when `config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.Name`)
    @param { string }   [config.volume_serial_num]             - The serial number of the volume.
                                                                 (required when `config.volume_id_method === VOLUME_IDENTIFICATION_METHODS.SerialNumber`)
    @param { boolean }  [config.volume_low_space_alarm_active] - The flag indicating if the low
                                                                 space alarm is active or not.
    @param { number }   [config.volume_alarm_threshold]        - The  low space threshold, in percent.
                                                                 (required when `config.volume_low_space_alarm_active === true`)

    @return {boolean} - `true` if the configuration is valid. `false` otherwise.
    ======================================================================== */
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

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Helper to evaluate the validity of the volume exclusion configuration.

    @param { object }   [mask_config]                          - Volume exclusion mask.

    @return {boolean} - `true` if the exclusion mask is valid. `false` otherwise.
    ======================================================================== */
    static _validateVolumeExclusionMask(maskConfig) {
        let valid = (maskConfig !== undefined);

        if (valid) {
            valid = (typeof(maskConfig) === 'string');
        }
        return valid;
    }
}

var _childProcessModule = {};

/**
 * @description Wrapper for managing spawned tasks.
 * @copyright 2020
 * @author Mike Price <dev.grumptech@gmail.com>
 * @module SpawnHelperModule
 * @requires debug
 * @see {@link https://github.com/debug-js/debug#readme}
 * @requires events
 * @see {@link https://nodejs.org/dist/latest-v16.x/docs/api/events.html#events}
 * @requires child_process
 * @see {@link https://nodejs.org/dist/latest-v16.x/docs/api/child_process.html}
 */

/**
 * @description Function pointer for spawn function.
 * @private
 */
const _spawn = _childProcessModule.spawn;
/**
 * @description Debugging function pointer for runtime related diagnostics.
 * @private
 */
const _debug$1 = new _debugModule__default["default"]('spawn_helper');

// Bind debug to console.log
// eslint-disable-next-line no-console
_debug$1.log = console.log.bind(console);

/**
 * @description Task Completed notification
 * @event module:SpawnHelperModule#event:complete
 * @type {object} e - Event notification payload.
 * @param {boolean} e.valid - Flag indicating if the spawned task completed successfully.
 * @param {Buffer} e.result - Buffer of result or error data returned by the spawned process.
 * @param {SpawnHelper} e.source - Reference to the spawn helper that raised the notification.
 */
/**
 * @description Wrapper for spawning child process tasks
 * @augments EventEmitter
 * @fires module:SpawnHelperModule#event:complete
 */
class SpawnHelper extends EventEmitter {
    /**
     * @description Constructor
     * @class
     * @param {object} config - Not used or validated.
     * @throws {TypeError} - Thrown if any configuration data are specified.
     */
    constructor(config) {
        if (config !== undefined) {
            throw new TypeError('SpawnHelper does not use any arguments.');
        }

        // Initialize the base class.
        super();

        // Initialize data members.
        /**
         * @member {string} _command - Spawn request command.
         * @private
         */
        this._command           = undefined;
        /**
         * @member {string[]} _arguments - Spawn request arguments.
         * @private
         */
        this._arguments         = undefined;
        /**
         * @member {string[]} _options - Spawn request options.
         * @private
         */
        this._options           = undefined;
        /**
         * @member {*} _token - Data for special handling when the spawn process completes.
         * @private
         */
        this._token             = undefined;
        /**
         * @member {Buffer} _result_data - Data for the spawned process results.
         * @private
         */
        this._result_data       = undefined;
        /**
         * @member {Buffer} _error_data - Data for the spawned procees error.
         * @private
         */
        this._error_data        = undefined;
        /**
         * @member {boolean} _error_encountered - Flag indicating if any errors were encountered during the process.
         * @private
         */
        this._error_encountered = false;
        /**
         * @member {boolean} _pending - Flag indicating if the spawned process is in progress.
         * @private
         */
        this._pending           = false;

        // Bound Callbacks
        /**
         * @member {Function} _CB__process_stdout_data - Callback for handling the STDOUT data notification.
         * @private
         */
        this._CB__process_stdout_data   = this._process_stdout_data.bind(this);
        /**
         * @member {Function} _CB__process_stderror_data - Callback for handling the STDERR data notification.
         * @private
         */
        this._CB__process_stderror_data = this._process_stderror_data.bind(this);
        /**
         * @member {Function} _CB_process_message - Callback for handling the message notifications.
         * @private
         */
        this._CB_process_message        = this._process_message.bind(this);
        /**
         * @member {Function} _CB_process_error - Callback for handling the error notifications.
         * @private
         */
        this._CB_process_error          = this._process_error.bind(this);
        /**
         * @member {Function} _CB_process_close - Callback for handling the close notification when the spawned process terminates.
         * @private
         */
        this._CB_process_close          = this._process_close.bind(this);
    }

    /**
     * @description Read-only property accessor indicating is the spawned task is in progress.
     * @returns {boolean} - true if the spawned task is in progres.
     */
    get IsPending() {
        return (this._pending);
    }

    /**
     * @description Read-only property accessor the valid flag
     * @returns {boolean} - true if processing completed successfully.
     */
    get IsValid() {
        return ((this._command !== undefined) &&
                !this.IsPending && !this._error_encountered);
    }

    /**
     * @description Read-only property accessor the result data
     * @returns {Buffer} - Data collected from the spawn process.
     *                     Unreliable and/or undefined if processing was not successful.
     */
    get Result() {
        return (this._result_data);
    }

    /**
     * @description Read-only property accessor the error data
     * @returns {Buffer} - Error data collected from the spawn process.
     *                     Unreliable and/or undefined if processing did not encounter any issues.
     */
    get Error() {
        return (this._error_data);
    }

    /**
     * @description Read-only property accessor the spawn command request
     * @returns {string} - Command request for the spawned process.
     */
    get Command() {
        return (this._command);
    }

    /**
     * @description Read-only property accessor the arguments to the spawn request.
     * @returns {string[]} - Arguments to the spawned process.
     */
    get Arguments() {
        return (this._arguments);
    }

    /**
     * @description Read-only property accessor for the options to the spawn request.
     * @returns {string[]} - Options to the spawned process.
     */
    get Options() {
        return (this._options);
    }

    /**
     * @description Read-only property accessor for the token used to store data for use when the process completes.
     * @returns {any} - Identity token for the spawned process.
     */
    get Token() {
        return (this._token);
    }

    /**
     * @description Initiates a spawned process.
     * @param {object} request -  Configuration data for the spawned request.
     * @param {string} request.command - Spawn request command.
     * @param {string[]} [request.arguments] - Spawn arguments.
     * @param {string[]} [request.options] - Spawn options.
     * @param {string[]} [request.token] - Spawn token used for special handling when the process completes.
     * @returns {void}
     * @throws {Error} - Thrown if a spawned process is already in progress.
     * @throws {TypeError} - Thrown if the configuration data do not meet expectations.
     */
    Spawn(request) {
        // Ensure a spawn is not already in progress.
        if (this.IsPending) {
            throw new Error('Spawn is already in progress.');
        }

        // Validate the arguments.
        if ((request === undefined) || (typeof(request) !== 'object')) {
            throw new TypeError('request must be an obkect');
        }
        // Validate 'required' command request.
        if ((!Object.prototype.hasOwnProperty.call(request, 'command')) ||
            (typeof(request.command) !== 'string') ||
            (request.command.length <= 0)) {
            throw new TypeError('request.command must be a non-zero length string.');
        }
        // If we got this far, then request.command mus be legit.
        this._command = request.command;

        // Validate 'optional' arguments request
        if (Object.prototype.hasOwnProperty.call(request, 'arguments')) {
            if (!Array.isArray(request.arguments)) {
                throw new TypeError('request.arguments must be an array of strings.');
            }
            else {
                for (const arg of request.arguments) {
                    if (typeof(arg) !== 'string') {
                        throw new TypeError('request.arguments must contain only strings.');
                    }
                }
            }
            // If we got this far, then request.arguments must be legit
            this._arguments = request.arguments;
        }
        else {
            // Use default
            this._arguments = [];
        }

        // Validate 'optional' options request
        if (Object.prototype.hasOwnProperty.call(request, 'options')) {
            if (!Array.isArray(request.options)) {
                throw new TypeError('request.options must be an array of strings.');
            }
            else {
                for (const arg of request.options) {
                    if (typeof(arg) !== 'string') {
                        throw new TypeError('request.options must contain only strings.');
                    }
                }
            }
            // If we got this far, then request.options must be legit
            this._options = request.options;
        }
        else {
            // Use default
            this._options = [];
        }

        // Validate 'optional' token request.
        // This object is a client-specified marker that can be used by the client when processing
        // results.
        if (Object.prototype.hasOwnProperty.call(request, 'token')) {
            if (request.token === undefined) {
                throw new TypeError('request.token must be something if it is specified.');
            }
            // If we got this far, then request.info must be legit
            this._token = request.token;
        }
        else {
            // Use default
            this._token = undefined;
        }

        // Reset the internal data
        this._result_data       = undefined;
        this._error_data        = undefined;
        this._error_encountered = false;
        this._pending           = true;  // Think positive :)

        // Spawn the request
        const childProcess = _spawn(this._command, this._arguments, this._options);
        // Register for the stdout.data notifications
        childProcess.stdout.on('data', this._CB__process_stdout_data);
        // Register for the stderr.data notifications
        childProcess.stderr.on('data', this._CB__process_stderror_data);
        // Register for the message notification
        childProcess.on('message', this._CB_process_message);
        // Register for the error notification
        childProcess.on('error', this._CB_process_error);
        // Register for the close notification
        childProcess.on('close', this._CB_process_close);
    }

    /**
     * @description Event handler for the STDOUT Data Notification
     * @param {Buffer | string | any} chunk - Notification data.
     * @returns {void}
     * @private
     */
    _process_stdout_data(chunk) {
        if (this._result_data === undefined) {
            // Initialize the result data
            this._result_data = chunk;
        }
        else {
            // Otherwise, append the chunk.
            this._result_data += chunk;
        }
    }

    /**
     * @description Event handler for the STDERR Data Notification
     * @param {Buffer | string | any} chunk - Notification data.
     * @returns {void}
     * @private
     */
    _process_stderror_data(chunk) {
        if (this._error_data === undefined) {
            // Initialize the result data
            this._error_data = chunk;
        }
        else {
            // Otherwise, append the chunk.
            this._error_data += chunk;
        }

        // Ensure that the error is recorded.
        this._error_encountered = true;
    }

    /**
     * @description Event handler for the Child Process Message Notification
     * @param {object} message - A parsed JSON object or primitive value.
     * @param {object} sendHandle - A net.Socket or net.Server object, or undefined.
     * @returns {void}
     * @private
     * @todo - Not sure if this is needed.
     */
    _process_message(message, sendHandle) {
        _debug$1(`Child Process for ${this.Command}: '${message}'`);
    }

    /**
     * @description Event handler for the Child Process Error Notification
     * @param {Error} error - The error
     * @returns {void}
     * @private
     */
    _process_error(error) {
        // Log the error info.
        _debug$1(`Child Process for ${this.Command}: error_num:${error.number} error_name:${error.name} error_msg:${error.message}`);

        // Ensure that the error is recorded.
        this._error_encountered = true;
    }

    /**
     * @description Event handler for the Child Process Close Notification
     * @param {number} code - The exit code if the child exited on its own.
     * @param {string} signal - The signal by which the child process was terminated.
     * @returns {void}
     * @private
     */
    _process_close(code, signal) {
        // Log the close info.
        _debug$1(`Child Process for ${this.Command}: exit_code:${code} by signal:'${signal}'`);

        // Indicate that we are done.
        this._pending = false;

        // Notify our clients.
        const isValid = this.IsValid;
        // eslint-disable-next-line object-curly-newline
        const response = {valid: isValid, result: (isValid ? this.Result : this.Error), token: this.Token, source: this};
        this.emit('complete', response);
    }
}

/* ==========================================================================
   File:               volumeInterrogator_darwin.js
   Class:              Volume Interrogator for OSX/macOS (darwin)
   Description:        Controls the collection of volume specific information
                       and attributes to be published to homekit.
   Copyright:          Oct 2021
   ========================================================================== */

// External dependencies and imports.
// eslint-disable-next-line camelcase
const _debug_process$1    = require('debug')('vi_process');
// eslint-disable-next-line camelcase
const _debug_config$1     = require('debug')('vi_config');
const _plist            = require('plist');

// Bind debug to console.log
// eslint-disable-next-line camelcase, no-console
_debug_process$1.log = console.log.bind(console);
// eslint-disable-next-line camelcase, no-console
_debug_config$1.log  = console.log.bind(console);

// Helpful constants and conversion factors.
const BLOCKS512_TO_BYTES$1                = 512;
const REGEX_WHITE_SPACE$1                 = /\s+/;

/* ==========================================================================
   Class:              VolumeInterrogator_darwin
   Description:        Manager for interrogating volumes on the OSX/macOS systems.
   Copyright:          Oct 2021

   @event 'ready' => function({object})
   @event_param {<VolumeData>}  [results]  - Array of volume data results.
   Event emmitted when the (periodic) interrogation is completes.

   @event 'scanning' => function({object})
   Event emmitted when a refresh/rescan is initiated.
   ========================================================================== */
// eslint-disable-next-line camelcase
class VolumeInterrogator_darwin extends VolumeInterrogatorBase {
/*  ========================================================================
    Description:    Constructor

    @param {object}     [config] - The settings to use for creating the object.

    @return {object}  - Instance of the volumeInterrogator_darwin class.

    @throws {Error}   - If the platform operating system is not compatible.
    ======================================================================== */
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

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Helper function used to initiate an interrogation of the
                 system volumes on darwin operating systems.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _initiateInterrogation() {
        // Spawn a 'ls /Volumes' to get a listing of the 'visible' volumes.
        const lsVolumes = new SpawnHelper();
        lsVolumes.on('complete', this._CB__visible_volumes);
        lsVolumes.Spawn({command: 'ls', arguments: ['/Volumes']});
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Helper function used to reset an interrogation.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _doReset() {
        this._pendingFileSystems    = [];
        this._theVisibleVolumeNames = [];
        this._pendingVolumes        = [];
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Read-Only Property used to determine if a check is in progress.

    @return {boolean} - true if a check is in progress.
    ======================================================================== */
    get _isCheckInProgress() {
        _debug_process$1(`_isCheckInProgress: Pending Volume Count - ${this._pendingVolumes.length}`);

        const checkInProgress = ((this._pendingVolumes.length !== 0) ||
                                 (this._pendingFileSystems.length !== 0));

        return checkInProgress;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Read-only property used to get an array of watch folders
                    used to initiate an interrogation.

    @return {[string]} - Array of folders to be watched for changes.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    get _watchFolders() {
        return (['/Volumes']);
    }

    // eslint-disable-next-line indent
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
        _debug_config$1(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config$1(response.result.toString());

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
            diskutilList.on('complete', this._CB__list_known_virtual_filesystems_complete);
            diskutilList.Spawn({command: 'lsvfs'});
        }
        else {
            // Clear the check in progress.
            this._checkInProgress = false;
            _debug_process$1(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);

            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results: []});
        }
    }

    // eslint-disable-next-line indent
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
        _debug_config$1(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config$1(response.result.toString());

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
                const fields = element.split(REGEX_WHITE_SPACE$1);

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
                            _debug_process$1(`Spawn df for fs type '${newFS.type}'.`);
                            const diskUsage = new SpawnHelper();
                            diskUsage.on('complete', this._CB__display_free_disk_space_complete);
                            diskUsage.Spawn({command: 'df', arguments: ['-a', '-b', '-T', newFS.type], token: newFS});
                        }
                        else {
                            // Replace the existing item with this one
                            this._pendingFileSystems[existingFSIndex] = newFS;

                            _debug_process$1(`_on_lsvfs_complete: Duplicated file system type. '${newFS.type}'`);
                        }
                    }
                }
                else {
                    _debug_process$1(`_on_lsvfs_complete: Error processing line '${element}'`);
                    _debug_process$1(fields);
                }
            });
        }
        else {
            // Clear the check in progress.
            this._checkInProgress = false;
            _debug_process$1(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);

            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results: []});
        }
    }

    // eslint-disable-next-line indent
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
        _debug_config$1(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config$1(response.result.toString());
        if (response.token !== undefined) {
            _debug_config$1('Spawn Token:');
            _debug_config$1(response.token);
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
                    const fields = element.split(REGEX_WHITE_SPACE$1);

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
                        capacity_bytes:     newVol.blocks * BLOCKS512_TO_BYTES$1,
                        free_space_bytes:   (newVol.blocks - newVol.used_blks) * BLOCKS512_TO_BYTES$1,
                        visible:            this._theVisibleVolumeNames.includes(volName),
                        low_space_alert:    lowSpaceAlert,
                    });
                    /* eslint-enable key-spacing */

                    // Get more informaion on this volume.
                    _debug_process$1(`Initiating 'diskutil info' for DiskId '${volData.DeviceNode}'`);
                    const diskutilInfo = new SpawnHelper();
                    diskutilInfo.on('complete', this._CB_process_diskUtil_info_complete);
                    diskutilInfo.Spawn({command: 'diskutil', arguments: ['info', '-plist', volData.DeviceNode], token: volData});

                    // Add this volume to the list of pending volumes.
                    this._pendingVolumes.push(volData);
                });
            }
        }
        else {
            // Clear the check in progress.
            this._checkInProgress = false;
            _debug_process$1(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);

            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results: []});
        }
    }

    // eslint-disable-next-line indent
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
        _debug_config$1(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);
        _debug_config$1(response.result.toString());

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
                        _debug_process$1('Unexpected call to _on_process_diskutil_info_complete. token not pending.');
                        _debug_process$1(response.token);
                    }
                }
                else {
                    // Unexpected token data !!

                    // Clear the check in progress.
                    this._checkInProgress = false;
                    // Flag the error
                    errorEncountered = true;
                    _debug_process$1('Unexpected call to _on_process_diskutil_info_complete. token is not instance of VolumeData.');
                    _debug_process$1(response.token);
                }

                if (!errorEncountered) {
                    // Attempt to parse the data as a plist.
                    const config = _plist.parse(response.result.toString());

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
                                du_process.on('complete', this._CB_process_disk_utilization_stats_complete);
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
                                _debug_process$1('_on_process_diskutil_info_complete: Unable to handle response from diskutil.');
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
                            _debug_process$1('Unexpected call to _on_process_diskutil_info_complete. config.');
                            _debug_process$1(config);
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
                _debug_process$1(`Error processing 'diskutil info'. Err:${error}`);
            }
        }
        else {
            // Clear the check in progress.
            this._checkInProgress = false;
            // Flag the error
            errorEncountered = true;
            _debug_process$1(`Error processing '${response.source.Command} ${response.source.Arguments}'. Err:${response.result}`);
        }

        // Was a critical error encountered while processing the data?
        if (errorEncountered) {
            // Fire the ready event with no data.
            // This willl provide the client an opportunity to reset
            this.emit('ready', {results: []});
        }
    }

    // eslint-disable-next-line indent
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
        _debug_config$1(`'${response.source.Command} ${response.source.Arguments}' Spawn Helper Result: valid:${response.valid}`);

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
                const usedBytes     = VolumeData.ConvertFrom1KBlockaToBytes(Number.parseInt(fields[0], 10));
                const volumeName    = fields[1].trim();
                _debug_process$1(`du results: Name:${volumeName} Used:${VolumeData.ConvertFromBytesToGB(usedBytes)} raw:${Number.parseInt(fields[0], 10)}`);

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
                        _debug_process$1('Unable to identify unique volumeData item.');
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
                    _debug_process$1(`Unexpected call to _on_process_disk_utilization_stats_complete. mount_point:${fields[1]}`);
                    throw new Error(`Unexpected call to _on_process_disk_utilization_stats_complete. mount_point:${fields[1]}`);
                }
            }
            else {
                // Clear the check in progress.
                this._checkInProgress = false;
                _debug_process$1(`Unable to paese '${response.source.Command} ${response.source.Arguments}' results`);
                throw Error(`Unable to paese '${response.source.Command} ${response.source.Arguments}' results`);
            }
        }
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Helper for extracting the disk identifiers from the data provided
                  by 'diskutil list' for HFS+ volumes.

    @param { object } [disks] - list of disk data provided by 'diskutil list' for non-APFS disks .

    @return { [string] } - Array of disk identifiers.

    @throws {TypeError} - thrown for enteries that are not specific to Partitions
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
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
                        _debug_process$1('_partitionDiskIdentifiers(): partition is not as expected. Missing or Invalid Disk Identifier.');
                        throw new TypeError('partition is not as expected. Missing or Invalid Disk Identifier.');
                    }
                }
            }
            else {
                _debug_process$1('_partitionDiskIdentifiers(): drive is not as expected. No partitions.');
                throw new TypeError('drive is not as expected. No partitions.');
            }
        }

        return diskIdentifiers;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:  Helper for extracting the disk identifiers from the data provided
                  by 'diskutil list' for AFPS volumes.

    @param { object } [containers] - list of AFPS container data provided by 'diskutil list'

    @return { [string] } - Array of disk identifiers.

    @throws {TypeError} - thrown for enteries that are not specific to AFPS volumes.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
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
                        _debug_process$1('_apfsDiskIdentifiers(): volume is not as expected. Missing or Invalid Disk Identifier.');
                        throw new TypeError('volume is not as expected. Missing or Invalid Disk Identifier.');
                    }
                }
            }
            else {
                _debug_process$1('_apfsDiskIdentifiers(): volume is not as expected. (AFPS)');
                throw new TypeError('volume is not as expected. (AFPS)');
            }
        }

        return diskIdentifiers;
    }
}

/* ==========================================================================
   File:               volumeInterrogator_darwin.js
   Class:              Volume Interrogator for Linux
   Description:        Controls the collection of volume specific information
                       and attributes to be published to homekit.
   Copyright:          Nov 2021
   ========================================================================== */

// External dependencies and imports.
const _os               = require('os');
// eslint-disable-next-line camelcase
const _debug_process    = require('debug')('vi_process');
// eslint-disable-next-line camelcase
const _debug_config     = require('debug')('vi_config');

// Bind debug to console.log
// eslint-disable-next-line camelcase, no-console
_debug_process.log = console.log.bind(console);
// eslint-disable-next-line camelcase, no-console
_debug_config.log  = console.log.bind(console);

// Helpful constants and conversion factors.
const BLOCKS512_TO_BYTES                = 512;
const REGEX_WHITE_SPACE                 = /\s+/;

/* ==========================================================================
   Class:              VolumeInterrogator_linux
   Description:        Manager for interrogating volumes on the linux-based systems.
   Copyright:          Nov 2021

   @event 'ready' => function({object})
   @event_param {<VolumeData>}  [results]  - Array of volume data results.
   Event emmitted when the (periodic) interrogation is completes.

   @event 'scanning' => function({object})
   Event emmitted when a refresh/rescan is initiated.
   ========================================================================== */
// eslint-disable-next-line camelcase
class VolumeInterrogator_linux extends VolumeInterrogatorBase {
/* ========================================================================
    Description:    Constructor

    @param {object}     [config] - The settings to use for creating the object.

    @return {object}  - Instance of the volumeInterrogator_darwin class.

    @throws {Error}   - If the platform operating system is not compatible.
    ======================================================================== */
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

        this._CB__display_free_disk_space_complete          = this._on_df_complete.bind(this);
    }

    // eslint-disable-next-line indent
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
        diskUsage.Spawn({command: 'df', arguments: ['--block-size=512', '--portability', '--print-type', '--exclude-type=tmpfs', '--exclude-type=devtmpfs']});
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Helper function used to reset an interrogation.

    @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _doReset() {
        // Clear Check-in-Progress.
        this._dfSpawnInProgress = false;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Read-Only Property used to determine if a check is in progress.

    @return {boolean} - true if a check is in progress.
    ======================================================================== */
    get _isCheckInProgress() {
        return this._dfSpawnInProgress;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Read-only property used to get an array of watch folders
                    used to initiate an interrogation.

    @return {[string]} - Array of folders to be watched for changes.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    get _watchFolders() {
        const {username} = _os.userInfo();
        _debug_process(`Username: ${username}`);

        return ([`/media/${username}`, '/mnt']);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description:    Event handler for the SpawnHelper 'complete' Notification

    @param { object }                      [response]        - Spawn response.
    @param { bool }                        [response.valid]  - Flag indicating if the spawned
                                                               process was completed successfully.
    @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by
                                                               the spawned process.
    @param { <any> }                       [response.token]  - Client specified token intended to
                                                               assist in processing the result.
    @param { SpawnHelper }                 [response.source] - Reference to the SpawnHelper that
                                                               provided the results.

    @throws {Error} - thrown for vaious error conditions.
    ======================================================================== */
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

/* ==========================================================================
   File:               main.js
   Description:        Homebridge integration for Volume Monitor
   Copyright:          Jan 2021
   ========================================================================== */

// External dependencies and imports.
const _debug = require('debug')('homebridge');

// Configuration constants.
const PLUGIN_NAME   = config_info.plugin;
const PLATFORM_NAME = config_info.platform;

// Internal Constants
// History:
// unspecified: Initial Release
//          v2: Purge Offline and better UUID management.
const ACCESSORY_VERSION = 2;

const FIXED_ACCESSORY_SERVICE_TYPES = {
    Switch: 0,
};

// Listing of fixed (dedicated) accessories.
const FIXED_ACCESSORY_INFO = {
    CONTROLS: {
        uuid: '2CF5A6C7-8041-4805-8582-821B19589D60',
        model: 'Control Switches',
        serial_num: '00000001',
        service_list: {
            MANUAL_REFRESH: {
                type: FIXED_ACCESSORY_SERVICE_TYPES.Switch, name: 'Refresh', uuid: '23CB97AC-6F0C-46B5-ACF6-78025632A11F', udst: 'ManualRefresh',
            },
            PURGE_OFFLINE: {
                type: FIXED_ACCESSORY_SERVICE_TYPES.Switch, name: 'Purge',   uuid: 'FEE232D5-8E25-4C1A-89AC-5476B778ADEF', udst: 'PurgeOffline',
            },
        },
    },
};

// Host Operating System
const HOST_OPERATING_SYSTEM = process.platform;
// Supported operating systems.
const SUPPORTED_OPERATING_SYSTEMS = {
    OS_DARWIN: 'darwin',
    // eslint-disable-next-line key-spacing
    OS_LINUX:  'linux',
};

// Accessory must be created from PlatformAccessory Constructor
let _PlatformAccessory;
// Service and Characteristic are from hap-nodejs
let _hap;

/* ==========================================================================
   Class:              VolumeInterrogatorPlatform
   Description:        Homebridge platform for managing the Volume Interrogator
   Copyright:          Jan 2021
   ========================================================================== */
class VolumeInterrogatorPlatform {
/*  ========================================================================
    Description:    Constructor

    @param {object} [log]      - Object for logging in the Homebridge Context
    @param {object} [config]   - Object for the platform configuration (from config.json)
    @param {object} [api]      - Object for the Homebridge API.

    @return {object}  - Instance of VolumeInterrogatorPlatform

    @throws {<Exception Type>}  - <Exception Description>
    ======================================================================== */
    constructor(log, config, api) {
        /* Cache the arguments. */
        this._log     = log;
        this._config  = config;
        this._api     = api;

        /* My local data */
        this._name = this._config.name;

        let theSettings;
        const viConfig = {};
        if (Object.prototype.hasOwnProperty.call(this._config, 'settings')) {
            // Get the system configuration,
            theSettings = this._config.settings;
        }
        if (theSettings !== undefined) {
            // Polling Interval {Hours}
            if (Object.prototype.hasOwnProperty.call(theSettings, 'polling_interval')) {
                if (typeof(theSettings.polling_interval) === 'number') {
                    // Copy the period (in hours)
                    viConfig.period_hr = theSettings.polling_interval;
                }
                else {
                    throw new TypeError(`Configuration item 'polling_interval' must be a number. {${typeof(theSettings.polling_interval)}}`);
                }
            }
            // Default Low Space Alarm Threshold {Percent}
            if (Object.prototype.hasOwnProperty.call(theSettings, 'alarm_threshold')) {
                if (typeof(theSettings.alarm_threshold) === 'number') {
                    // Set the period (in hours)
                    viConfig.default_alarm_threshold = theSettings.alarm_threshold;
                }
                else {
                    throw new TypeError(`Configuration item 'alarm_threshold' must be a number. {${typeof(theSettings.alarm_threshold)}}`);
                }
            }
            // Array of exclusion masks
            if (Object.prototype.hasOwnProperty.call(theSettings, 'exclusion_masks')) {
                if (Array.isArray(theSettings.exclusion_masks)) {
                    let exclusionMasksValid = true;
                    // eslint-disable-next-line no-restricted-syntax
                    for (const mask of theSettings.exclusion_masks) {
                        exclusionMasksValid = exclusionMasksValid && (typeof(mask) === 'string');
                    }
                    if (exclusionMasksValid) {
                        // Set the exclusion masks.
                        viConfig.exclusion_masks = theSettings.exclusion_masks;
                    }
                }
                else {
                    throw new TypeError(`Configuration item 'exclusion_masks' must be an array of strings. {${typeof(theSettings.exclusion_masks)}}`);
                }
            }
            // Enable Volume Customizations
            if (Object.prototype.hasOwnProperty.call(theSettings, 'enable_volume_customizations')) {
                if (typeof(theSettings.enable_volume_customizations) === 'boolean') {
                    // Are the volume customizations enabled?
                    if (theSettings.enable_volume_customizations) {
                        if ((Object.prototype.hasOwnProperty.call(theSettings, 'volume_customizations')) &&
                            (Array.isArray(theSettings.volume_customizations))) {
                            viConfig.volume_customizations = theSettings.volume_customizations;
                        }
                    }
                }
                else {
                    throw new TypeError(`Configuration item 'enable_volume_customizations' must be a boolean. {${typeof(theSettings.enable_volume_customizations)}}`);
                }
            }
        }

        // Underlying engine. Operating system dependent.
        try {
            switch (HOST_OPERATING_SYSTEM.toLowerCase()) {
                // OSX & macOS
                case SUPPORTED_OPERATING_SYSTEMS.OS_DARWIN: {
                    this._volumeInterrogator = new VolumeInterrogator_darwin(viConfig);
                }
                // eslint-disable-next-line indent
                break;

                // Linux
                case SUPPORTED_OPERATING_SYSTEMS.OS_LINUX: {
                    this._volumeInterrogator = new VolumeInterrogator_linux(viConfig);
                }
                // eslint-disable-next-line indent
                break;

                default: {
                    // Unsupported OS
                    this._volumeInterrogator = undefined;
                    this._log(`Operating system not supported. os:${HOST_OPERATING_SYSTEM}`);
                }
                // eslint-disable-next-line indent
                break;
            }
        }
        catch (error) {
            this._volumeInterrogator = undefined;
            this._log(`Unable to create the VolumeInterrogator. err:'${error.message}`);
        }

        /* Bind Handlers */
        this._bindDoInitialization          = this._doInitialization.bind(this);
        this._bindDestructorNormal          = this._destructor.bind(this, {cleanup: true});
        this._bindDestructorAbnormal        = this._destructor.bind(this, {exit: true});
        this._CB_VolumeIterrrogatorScanning = this._handleVolumeInterrogatorScanning.bind(this);
        this._CB_VolumeIterrrogatorReady    = this._handleVolumeInterrogatorReady.bind(this);

        /* Log our creation */
        this._log('Creating VolumeInterrogatorPlatform');

        /* Create an empty map for our accessories */
        this._accessories = new Map();

        /* Create an empty map for our volume data.
           Using a Map to allow for easy updates/replacements */
        this._volumesData = new Map();

        // Register for the Did Finish Launching event
        this._api.on('didFinishLaunching', this._bindDoInitialization);
        this._api.on('shutdown', this._bindDestructorNormal);

        // Register for shutdown events.
        // do something when app is closing
        process.on('exit', this._bindDestructorNormal);
        // catches uncaught exceptions
        process.on('uncaughtException', this._bindDestructorAbnormal);

        // Register for Volume Interrogator events.
        if (this._volumeInterrogator !== undefined) {
            this._volumeInterrogator.on('scanning', this._CB_VolumeIterrrogatorScanning);
            this._volumeInterrogator.on('ready',    this._CB_VolumeIterrrogatorReady);
        }
    }

    // eslint-disable-next-line indent
/*  ========================================================================
    Description: Destructor

    @param {object} [options]  - Typically containing a "cleanup" or "exit" member.
    @param {object} [err]      - The source of the event trigger.
    ======================================================================== */
    // eslint-disable-next-line no-unused-vars
    async _destructor(options, err) {
        // Is there an indication that the system is either exiting or needs to
        // be cleaned up?
        if ((options.exit) || (options.cleanup)) {
            // Cleanup the volume interrogator.
            if (this._volumeInterrogator !== undefined) {
                this._log.debug('Terminating the volume interrogator.');
                this._volumeInterrogator.removeListener('scanning', this._CB_VolumeIterrrogatorScanning);
                this._volumeInterrogator.removeListener('ready',    this._CB_VolumeIterrrogatorReady);
                await this._volumeInterrogator.Terminate();
                this._volumeInterrogator = undefined;
            }
        }
        // Lastly eliminate myself.
        delete this;
    }

    // eslint-disable-next-line indent
/*  ========================================================================
    Description: Event handler when the system has loaded the platform.

    @throws {TypeError}  - thrown if the 'polling_interval' configuration item is not a number.
    @throws {RangeError} - thrown if the 'polling_interval' configuration item is outside the
                           allowed bounds.

    @remarks:     Opportunity to initialize the system and publish accessories.
    ======================================================================== */
    async _doInitialization() {
        this._log(`Homebridge Plug-In ${PLATFORM_NAME} has finished launching.`);

        // Abort if there is no interrogator
        if (this._volumeInterrogator === undefined) {
            this._log('Volume Interrogator not set.');
            return;
        }

        let theSettings;
        if (Object.prototype.hasOwnProperty.call(this._config, 'settings')) {
            // Get the system configuration,
            theSettings = this._config.settings;
        }

        // Check for Settings
        if (theSettings !== undefined) {
            // Polling Interval {Hours}
            if ((Object.prototype.hasOwnProperty.call(theSettings, 'polling_interval')) &&
                (typeof(theSettings.polling_interval) === 'number')) {
                if ((theSettings.polling_interval >= this._volumeInterrogator.MinimumPeriod) &&
                    (theSettings.polling_interval <= this._volumeInterrogator.MaximumPeriod)) {
                    // Set the period (in hours)
                    this._volumeInterrogator.Period = theSettings.polling_interval;
                }
                else {
                    // eslint-disable-next-line max-len
                    throw new RangeError(`Configuration item 'polling_interval' must be between ${this._volumeInterrogator.MinimumPeriod} and ${this._volumeInterrogator.MaximumPeriod}. {${theSettings.polling_interval}}`);
                }
            }
            else {
                throw new TypeError(`Configuration item 'polling_interval' must be a number. {${typeof(theSettings.polling_interval)}}`);
            }
        }

        // Flush any accessories that are not from this version.
        const accessoriesToRemove = [];
        for (const accessory of this._accessories.values()) {
            if (!Object.prototype.hasOwnProperty.call(accessory.context, 'VERSION') ||
                (accessory.context.VERSION !== ACCESSORY_VERSION)) {
                this._log(`Accessory ${accessory.displayName} has accessory version ${accessory.context.VERSION}. Version ${ACCESSORY_VERSION} is expected.`);
                // This accessory needs to be replaced.
                accessoriesToRemove.push(accessory);
            }
        }
        // Perform the cleanup.
        accessoriesToRemove.forEach((accessory) => {
            this._removeAccessory(accessory);
        });

        // Create and Configure the Accessory Controls if needed.
        if (!this._accessories.has(FIXED_ACCESSORY_INFO.CONTROLS.model)) {
            // Control Switches accessory never existed. Make one now.
            const accessoryControls = new _PlatformAccessory(FIXED_ACCESSORY_INFO.CONTROLS.model, FIXED_ACCESSORY_INFO.CONTROLS.uuid);

            // Add the identifier to the accessory's context. Used for remapping on depersistence.
            accessoryControls.context.ID = FIXED_ACCESSORY_INFO.CONTROLS.model;
            // Mark the version of the accessory. This is used for depersistence
            accessoryControls.context.VERSION = ACCESSORY_VERSION;
            // Create accessory persisted settings
            accessoryControls.context.SETTINGS = {
                SwitchStates: [
                    {id: FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.uuid, state: true},
                    {id: FIXED_ACCESSORY_INFO.CONTROLS.service_list.PURGE_OFFLINE.uuid,  state: false},
                ],
            };

            // Create & Configure the control services.
            for (const serviceItem of Object.values(FIXED_ACCESSORY_INFO.CONTROLS.service_list)) {
                const serviceType = this._getAccessoryServiceType(serviceItem.type);
                const service = accessoryControls.addService(serviceType, serviceItem.uuid, serviceItem.udst);
                if (service !== undefined) {
                    service.updateCharacteristic(_hap.Characteristic.Name, `${serviceItem.name}`);
                }
            }

            // Update the accessory information.
            this._updateAccessoryInfo(accessoryControls, {model: FIXED_ACCESSORY_INFO.CONTROLS.model, serialnum: FIXED_ACCESSORY_INFO.CONTROLS.serial_num});

            // configure this accessory.
            this._configureAccessory(accessoryControls);

            // register the manual refresh switch
            this._api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessoryControls]);
        }

        // Start interrogation.
        this._volumeInterrogator.Start();
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Homebridge API invoked after restoring cached accessorues from disk.

    @param {PlatformAccessory} [accessory] - Accessory to be configured.

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory
    ======================================================================== */
    configureAccessory(accessory) {
        // Validate the argument(s)
        if ((accessory === undefined) ||
            (!(accessory instanceof _PlatformAccessory))) {
            throw new TypeError('accessory must be a PlatformAccessory');
        }

        // Is this accessory already registered?
        let found = false;
        for (const acc of this._accessories.values()) {
            if (acc === accessory) {
                found = true;
                break;
            }
        }
        if (!found) {
            // Configure the accessory (also registers it.)
            try {
                this._configureAccessory(accessory);
            }
            catch (error) {
                this._log(`Unable to configure accessory ${accessory.displayName}. Version:${accessory.context.VERSION}. Error:${error}`);
                this._accessories.set(accessory.displayName, accessory);
            }
        }
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Event handler for the Volume Interrogator 'scanning' event.
    ======================================================================== */
    _handleVolumeInterrogatorScanning() {
        // Decouple from the event.
        setImmediate(() => {
            this._log.debug('Scanning initiated.');
            // If a scanning event has been initiated, Ensure that the the Refresh switch is On.
            const accessoryControls = this._accessories.get(FIXED_ACCESSORY_INFO.CONTROLS.model);
            if (accessoryControls !== undefined) {
                const serviceRefreshSwitch = accessoryControls.getService(FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.udst);
                if (serviceRefreshSwitch !== undefined) {
                    if (!this._getAccessorySwitchState(serviceRefreshSwitch)) {
                        this._log.debug('Setting Refresh switch On.');
                        serviceRefreshSwitch.updateCharacteristic(_hap.Characteristic.On, true);
                    }
                    else {
                        this._log.debug('Refresh switch is already On.');
                    }
                }
                else {
                    this._log.debug('Unable to find Manual Refresh service.');
                }
            }
            else {
                this._log.debug('Unable to find CONTROLS accessory');
            }
        });
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Event handler for the Volume Interrogator 'ready' event.

    @param {object} [theData] - object containing a 'results' item which is an array of volume
                                data results.

    @throws {TypeError} - Thrown when 'results' is not an Array of VolumeData objects.
    ======================================================================== */
    _handleVolumeInterrogatorReady(theData) {
        // Decouple from the event.
        setImmediate((data) => {
            // Validate the parameters.
            if ((data === undefined) ||
                (!Object.prototype.hasOwnProperty.call(data, 'results'))) {
                throw new TypeError('\'data\' needs to be an object with a \'results\' field.');
            }
            if (!Array.isArray(data.results)) {
                throw new TypeError('\'data.results\' needs to be an array of VolumeData objects.');
            }
            for (const result of data.results) {
                if (!(result instanceof VolumeData)) {
                    throw new TypeError('\'results\' needs to be an array of VolumeData objects.');
                }
            }

            // Update the volumes data.
            for (const result of data.results) {
                if (result.IsMounted) {
                    // eslint-disable-next-line max-len
                    this._log.debug(`\tName:${result.Name.padEnd(20, ' ')}\tVisible:${result.IsVisible}\tShown:${result.IsShown}\tSize:${VolumeData.ConvertFromBytesToGB(result.Size).toFixed(4)} GB\tUsed:${((result.UsedSpace / result.Size) * 100.0).toFixed(2)}%\tMnt:${result.MountPoint}`);
                }

                // Update the map of volume data.
                this._volumesData.set(result.Name, result);
            }

            // Loop through the visible volumes and publish/update them.
            for (const volData of this._volumesData.values()) {
                try {
                    // Do we know this volume already?
                    const volIsKnown = this._accessories.has(volData.Name);

                    // Is this volume visible & new to us?
                    if ((volData.IsShown) &&
                        (!volIsKnown)) {
                        // Does not exist. Add it
                        this._addBatteryServiceAccessory(volData.Name);
                    }

                    // Update the accessory if we know if this volume already
                    // (i.e. it is currently or was previously shown).
                    const theAccessory = this._accessories.get(volData.Name);
                    if (theAccessory !== undefined) {
                        this._updateBatteryServiceAccessory(theAccessory);
                    }
                }
                catch (error) {
                    this._log.debug(`Error when managing accessory: ${volData.Name}`);
                }
            }

            const accessoryControls = this._accessories.get(FIXED_ACCESSORY_INFO.CONTROLS.model);
            if (accessoryControls !== undefined) {
                // Cleanup (if purge is enabled)
                const servicePurge = accessoryControls.getServiceById(
                    FIXED_ACCESSORY_INFO.CONTROLS.service_list.PURGE_OFFLINE.uuid,
                    FIXED_ACCESSORY_INFO.CONTROLS.service_list.PURGE_OFFLINE.udst,
                );
                if (servicePurge !== undefined) {
                    const purgeState = this._getAccessorySwitchState(servicePurge);
                    if (purgeState) {
                        const purgeList = [];
                        // Check for Volumes that are no longer Visible or did not have any results
                        // reported.
                        for (const volData of this._volumesData.values()) {
                            // eslint-disable-next-line arrow-body-style
                            const resultFound = data.results.find((element) => {
                                return element.Name === volData.Name;
                            });
                            if ((this._accessories.has(volData.Name)) &&
                                ((!volData.IsShown) || (resultFound === undefined))) {
                                purgeList.push(this._accessories.get(volData.Name));
                            }
                        }
                        // Check for accessories whose volumes are unknown.
                        const excludedAccessoryKeys = [FIXED_ACCESSORY_INFO.CONTROLS.model];
                        for (const key of this._accessories.keys()) {
                            if ((!this._volumesData.has(key)) &&
                                (excludedAccessoryKeys.indexOf(key) === -1)) {
                                purgeList.push(this._accessories.get(key));
                            }
                        }
                        // Clean up.
                        purgeList.forEach((accessory) => {
                            this._volumesData.delete(accessory.displayName);
                            this._removeAccessory(accessory);
                        });
                    }
                }
                // Get the Manual Refresh service.
                const serviceManlRefresh = accessoryControls.getServiceById(
                    FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.uuid,
                    FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.udst,
                );
                if ((serviceManlRefresh !== undefined) &&
                    (this._getAccessorySwitchState(serviceManlRefresh))) {
                    // Ensure the switch is turned back off.
                    serviceManlRefresh.updateCharacteristic(_hap.Characteristic.On, false);
                }
            }

            // With the accessories that remain, force an update.
            const accessoryList = [];
            for (const accessory of this._accessories.values()) {
                accessoryList.push(accessory);
            }
            // Update, if needed.
            if (accessoryList.length > 0) {
                this._api.updatePlatformAccessories(accessoryList);
            }
        }, theData);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Create and register an accessory for the volume name.

    @param {string} [name] - name of the volume for the accessory.

    @throws {TypeError} - Thrown when 'name' is not a string.
    @throws {RangeError} - Thrown when 'name' length is 0
    @throws {Error} - Thrown when an accessory with 'name' is already registered.
    ======================================================================== */
    _addBatteryServiceAccessory(name) {
        // Validate arguments
        if ((name === undefined) || (typeof(name) !== 'string')) {
            throw new TypeError('name must be a string');
        }
        if (name.length <= 0) {
            throw new RangeError('name must be a non-zero length string.');
        }
        if (this._accessories.has(name)) {
            throw new Error(`Accessory '${name}' is already registered.`);
        }

        this._log.debug(`Adding new accessory: name:'${name}'`);

        // uuid must be generated from a unique but not changing data source,
        // theName should not be used in the most cases. But works in this specific example.
        const uuid = _hap.uuid.generate(name);
        const accessory = new _PlatformAccessory(name, uuid);

        // Create our services.
        accessory.addService(_hap.Service.BatteryService, name);

        // Mark the version of the accessory. This is used for depersistence
        accessory.context.VERSION = ACCESSORY_VERSION;

        try {
            // Configura the accessory
            this._configureAccessory(accessory);
        }
        catch (error) {
            this._log.debug('Error when configuring accessory.');
        }

        this._api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Internal function to perform accessory configuration and
                 internal 'registration' (appending to our list)

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory

    @remarks:     Opportunity to setup event handlers for characteristics
                  and update values (as needed).
    ======================================================================== */
    _configureAccessory(accessory) {
        if ((accessory === undefined) ||
            (!(accessory instanceof _PlatformAccessory))) {
            throw new TypeError('accessory must be a PlatformAccessory');
        }

        this._log.debug(`Configuring accessory ${accessory.displayName}`);

        // Register to handle the Identify request for the accessory.
        accessory.on(_PlatformAccessory.PlatformAccessoryEvent.IDENTIFY, () => {
            this._log(`${accessory.displayName} identified!`);
        });

        let theSwitchStates;
        const theSettings = accessory.context.SETTINGS;
        if ((theSettings !== undefined) &&
            (typeof(theSettings) === 'object') &&
            (Object.prototype.hasOwnProperty.call(theSettings, 'SwitchStates')) &&
            (Array.isArray(theSettings.SwitchStates))) {
            theSwitchStates = theSettings.SwitchStates;
        }

        // Does this accessory have Switch service(s)?
        for (const service of accessory.services) {
            if (service instanceof _hap.Service.Switch) {
                // Get the persisted switch state.
                let switchStateValue = true;
                if (Array.isArray(theSwitchStates)) {
                    for (const switchStateConfig of theSwitchStates) {
                        if ((typeof(switchStateConfig) === 'object') &&
                            (Object.prototype.hasOwnProperty.call(switchStateConfig, 'id')) &&
                            (typeof(switchStateConfig.id) === 'string') &&
                            (Object.prototype.hasOwnProperty.call(switchStateConfig, 'state')) &&
                            (typeof(switchStateConfig.state) === 'boolean') &&
                            (switchStateConfig.id === service.displayName)) {
                            switchStateValue = switchStateConfig.state;
                            break;
                        }
                    }
                }
                // Set the switch to the stored setting (the default is on).
                service.updateCharacteristic(_hap.Characteristic.On, switchStateValue);

                const charOn = service.getCharacteristic(_hap.Characteristic.On);
                // Build the identification id
                const id = `${service.displayName}.${service.subtype}`;
                // Register for the "get" event notification.
                // eslint-disable-next-line object-shorthand
                charOn.on('get', this._handleOnGet.bind(this, {accessory: accessory, service_id: id}));
                // Register for the "set" event notification.
                // eslint-disable-next-line object-shorthand
                charOn.on('set', this._handleOnSet.bind(this, {accessory: accessory, service_id: id}));
            }
        }

        // Is this accessory new to us?
        if (!this._accessories.has(accessory.displayName)) {
            // Update our accessory listing
            this._log.debug(`Adding accessory '${accessory.displayName} to the accessories list. Count:${this._accessories.size}`);
            this._accessories.set(accessory.displayName, accessory);
        }
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Remove/destroy an accessory

    @param {object} [accessory] - accessory to be removed.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory.
    @throws {RangeError} - Thrown when a 'accessory' is not registered.
    ======================================================================== */
    _removeAccessory(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError('Accessory must be a PlatformAccessory');
        }
        if (!this._accessories.has(accessory.displayName)) {
            throw new RangeError(`Accessory '${accessory.displayName}' is not registered.`);
        }

        this._log.debug(`Removing accessory '${accessory.displayName}'`);

        // Event Handler cleanup.
        accessory.removeAllListeners(_PlatformAccessory.PlatformAccessoryEvent.IDENTIFY);
        // Iterate through all the services on the accessory
        for (const service of accessory.services) {
            // Is this service a Switch?
            if (service instanceof _hap.Service.Switch) {
                // Get the On characteristic.
                const charOn = service.getCharacteristic(_hap.Characteristic.On);
                // Build the identification id
                const id = `${service.displayName}.${service.subtype}`;
                // Register for the "get" event notification.
                // eslint-disable-next-line object-shorthand
                charOn.off('get', this._handleOnGet.bind(this, {accessory: accessory, service_id: id}));
                // Register for the "get" event notification.
                // eslint-disable-next-line object-shorthand
                charOn.off('set', this._handleOnSet.bind(this, {accessory: accessory, service_id: id}));
            }
        }

        /* Unregister the accessory */
        this._api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        /* remove the accessory from our mapping */
        this._accessories.delete(accessory.displayName);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Update an accessory

    @param {object} [accessory] - accessory to be updated.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    ======================================================================== */
    _updateBatteryServiceAccessory(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError('Accessory must be a PlatformAccessory');
        }

        this._log.debug(`Updating accessory '${accessory.displayName}'`);

        // Create an error to be used to indicate that the accessory is
        // not reachable.
        const error = new Error(`Volume '${accessory.displayName} is not reachable.`);

        let percentFree     = error;
        let lowAlert        = error;
        let chargeState     = error;
        let theModel        = error;
        let theSerialNumber = error;

        // Is the volume associated with this directory known?
        if (this._volumesData.has(accessory.displayName)) {
            // Get the volume data.
            const volData = this._volumesData.get(accessory.displayName);

            if (volData.IsShown) {
                // Compute the fraction of space remaining.
                percentFree = volData.PercentFree.toFixed(0);
                // Determine if the remaining space threshold has been exceeded.
                lowAlert = volData.LowSpaceAlert;

                // The charging state is always 'Not Chargable'.
                chargeState = _hap.Characteristic.ChargingState.NOT_CHARGEABLE;
            }

            // Get Accessory Information
            theModel = volData.VolumeType;
            theSerialNumber = volData.VolumeUUID;
        }

        /* Update the accessory */
        /* Get the battery service */
        const batteryService = accessory.getService(_hap.Service.BatteryService);
        if (batteryService !== undefined) {
            /* Battery Charging State (Not applicable to this application) */
            batteryService.updateCharacteristic(_hap.Characteristic.ChargingState, chargeState);

            /* Battery Level Characteristic */
            batteryService.updateCharacteristic(_hap.Characteristic.BatteryLevel, percentFree);

            /* Low Battery Status (Used to indicate a nearly full volume) */
            batteryService.updateCharacteristic(_hap.Characteristic.StatusLowBattery, lowAlert);
        }

        // Update the accessory information
        this._updateAccessoryInfo(accessory, {model: theModel, serialnum: theSerialNumber});
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Update an accessory

    @param {object} [accessory] - accessory to be updated.

    @param {object} [info]                      - accessory information.
    @param {string | Error} [info.model]        - accessory model number
    @param {string | Error} [info.serialnum]    - accessory serial number.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    @throws {TypeError} - Thrown when 'info' is not undefined, does not have the 'model' or
                          'serialnum' properties or the properties are not of the expected type.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    _updateAccessoryInfo(accessory, info) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError('Accessory must be a PlatformAccessory');
        }
        if ((info === undefined) ||
            (!Object.prototype.hasOwnProperty.call(info, 'model'))     || ((typeof(info.model)      !== 'string') || (info.model instanceof Error)) ||
            (!Object.prototype.hasOwnProperty.call(info, 'serialnum')) || ((typeof(info.serialnum)  !== 'string') || (info.serialnum instanceof Error))) {
            throw new TypeError('info must be an object with properties named \'model\' and \'serialnum\' that are either strings or Error');
        }

        /* Get the accessory info service. */
        const accessoryInfoService = accessory.getService(_hap.Service.AccessoryInformation);
        if (accessoryInfoService !== undefined) {
            /* Manufacturer */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Manufacturer, 'GrumpTech');

            /* Model */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Model, info.model);

            /* Serial Number */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.SerialNumber, info.serialnum);
        }
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Event handler for the "get" event for the Switch.On characteristic.

    @param {object} [event_info] - accessory and id of the switch service being querried.
    @param {object} [event_info.accessory] - Platform Accessory
    @param {string} [event_info.service_id]- UUID of the Switch service being qeurried.

    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'event_info' is not an object.
    @throws {TypeError} - Thrown when 'event_info.accessory' is not an instance of
                          _PlatformAccessory.
    @throws {TypeError} - Thrown when 'event_info.service_id' is not a valid string.
    @throws {RangeError} - Thrown when 'event_info.service_id' does not belong to
                           'event_info.accessory'
    @throws {TypeError} - Thrown when 'event_info.service_id' does not correspond to a
                          Switch service.
    ======================================================================== */
    _handleOnGet(eventInfo, callback) {
        // Validate arguments
        if ((eventInfo === undefined) || (typeof(eventInfo) !== 'object') ||
            (!Object.prototype.hasOwnProperty.call(eventInfo, 'accessory')) ||
            (!Object.prototype.hasOwnProperty.call(eventInfo, 'service_id')))  {
            throw new TypeError('event_info must be an object with an \'accessory\' and \'service_id\' field.');
        }
        if ((eventInfo.accessory === undefined) || !(eventInfo.accessory instanceof _PlatformAccessory)) {
            throw new TypeError('\'event_info.accessory\' must be a PlatformAccessory');
        }
        if ((eventInfo.service_id === undefined) || (typeof(eventInfo.service_id) !== 'string') ||
            (eventInfo.service_id.length <= 0)) {
            throw new TypeError('\'event_info.service_id\' must be non-null string.');
        }
        const id = eventInfo.service_id.split('.');
        if (!Array.isArray(id) || (id.length !== 2)) {
            throw new TypeError(`'event_info.service_id' does not appear to be valid. '${eventInfo.service_id}'`);
        }

        const theService = eventInfo.accessory.getServiceById(id[0], id[1]);
        // Ensure that the Service Id belongs to the Accessory
        if (theService === undefined) {
            throw new RangeError('\'event_info.service_id\' does not belong to event_info.accessory.');
        }
        // Ensure that the Service Id belongs to the Accessory
        if (!(theService instanceof _hap.Service.Switch)) {
            throw new TypeError('\'event_info.service_id\' must correspond to a switch service.');
        }

        this._log.debug(`Switch '${eventInfo.accessory.displayName}-${theService.displayName}.${theService.subtype}' Get Request.`);

        let status = null;
        let result;
        try {
            result = this._getAccessorySwitchState(theService);
        }
        catch (err) {
            this._log.debug(`  Unexpected error encountered: ${err.message}`);
            result = false;
            status = new Error(`Accessory ${eventInfo.accessory.displayName} is not ressponding.`);
        }

        // Invoke the callback function with our result.
        callback(status, result);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Event handler for the "set" event for the Switch.On characteristic.

    @param {object} [event_info] - accessory and id of the switch service being set.
    @param {object} [event_info.accessory] - Platform Accessory
    @param {string} [event_info.service_id]- UUID of the Switch service being set.
    @param {bool} [value]        - new/rewuested state of the switch
    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'event_info' is not an object.
    @throws {TypeError} - Thrown when 'event_info.accessory' is not an instance of
                          _PlatformAccessory.
    @throws {TypeError} - Thrown when 'event_info.service_id' is not a valid string.
    @throws {RangeError} - Thrown when 'event_info.service_id' does not belong to
                           'event_info.accessory'
    @throws {TypeError} - Thrown when 'event_info.service_id' does not correspond to a
                          Switch service.
    ======================================================================== */
    _handleOnSet(eventInfo, value, callback) {
        // Validate arguments
        if ((eventInfo === undefined) || (typeof(eventInfo) !== 'object') ||
            (!Object.prototype.hasOwnProperty.call(eventInfo, 'accessory')) ||
            (!Object.prototype.hasOwnProperty.call(eventInfo, 'service_id')))  {
            throw new TypeError('event_info must be an object with an \'accessory\' and \'service_id\' field.');
        }
        if ((eventInfo.accessory === undefined) || !(eventInfo.accessory instanceof _PlatformAccessory)) {
            throw new TypeError('\'event_info.accessory\' must be a PlatformAccessory');
        }
        if ((eventInfo.service_id === undefined) || (typeof(eventInfo.service_id) !== 'string') ||
            (eventInfo.service_id.length <= 0)) {
            throw new TypeError('\'event_info.service_id\' must be non-null string.');
        }
        const id = eventInfo.service_id.split('.');
        if (!Array.isArray(id) || (id.length !== 2)) {
            throw new TypeError(`'event_info.service_id' does not appear to be valid. '${eventInfo.service_id}'`);
        }

        const theService = eventInfo.accessory.getServiceById(id[0], id[1]);
        // Ensure that the Service Id belongs to the Accessory
        if (theService === undefined) {
            throw new RangeError('\'event_info.service_id\' does not belong to event_info.accessory.');
        }
        // Ensure that the Service Id belongs to the Accessory
        if (!(theService instanceof _hap.Service.Switch)) {
            throw new TypeError('\'event_info.service_id\' must correspond to a switch service.');
        }

        this._log.debug(`Switch '${eventInfo.accessory.displayName}-${theService.displayName}.${theService.subtype}' Set Request. New state:${value}`);

        let theSwitchState;
        const theSettings = eventInfo.accessory.context.SETTINGS;
        if ((theSettings !== undefined) &&
            (typeof(theSettings) === 'object') &&
            (Object.prototype.hasOwnProperty.call(theSettings, 'SwitchStates')) &&
            (Array.isArray(theSettings.SwitchStates))) {
            for (const candidateSwitchState of theSettings.SwitchStates) {
                if (candidateSwitchState.id === theService.displayName) {
                    theSwitchState = candidateSwitchState;
                }
            }
        }

        let status = null;
        let finalValue = value;
        try {
            // The processing of the request to set a switch is context (switch) specific.
            // The Manual Refresh switch has special logic.
            if ((id[0] === FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.uuid) &&
                (id[1] === FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.udst)) {
                const currentValue = this._getAccessorySwitchState(theService);

                // The user is not allowed to turn the switch off.
                // It will auto reset when the current check is complete.
                if ((!value) && (currentValue)) {
                    // Attempting to turn the switch from on to off.
                    // Not permitted.
                    this._log.debug(`Unable to turn the '${eventInfo.accessory.displayName}' switch off.`);
                    status = new Error(`Unable to turn the '${eventInfo.accessory.displayName}' switch off.`);

                    // Decouple setting the switch back on.
                    setImmediate((evtInfo, resetVal) => {
                        if (theService !== undefined) {
                            this._log.debug(`Switch '${theService.displayName}' Restoring state ${resetVal}`);
                            theService.updateCharacteristic(_hap.Characteristic.On, resetVal);
                        }
                    }, eventInfo, currentValue);

                    finalValue = currentValue;
                }
                else {
                    // The change is permitted.
                    // If the switch was turned on, then intiate a volume refresh.
                    // eslint-disable-next-line no-lonely-if
                    if (value) {
                        this._volumeInterrogator.Start();
                    }
                }
            }
        }
        catch (err) {
            this._log.debug(`  Unexpected error encountered: ${err.message}`);

            status = new Error(`Accessory ${eventInfo.accessory.displayName} is not ressponding.`);
        }

        // Persist the value set.
        if (theSwitchState !== undefined) {
            theSwitchState.state = finalValue;
        }

        callback(status);
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Get the value of the Service.Switch.On characteristic value

    @param {object} [switchService] - Switch Service

    @return - the value of the On characteristic (true or false)

    @throws {TypeError} - Thrown when 'switchService' is not an instance of a Switch Service.
    @throws {TypeError} - Thrown when 'event_info.accessory' is not an instance of
                          _PlatformAccessory.
    @throws {TypeError} - Thrown when 'event_info.service_id' is not a valid string.
    @throws {RangeError} - Thrown when 'event_info.service_id' does not belong to
                           'event_info.accessory'
    @throws {TypeError} - Thrown when 'event_info.service_id' does not correspond to a
                          Switch service.
    @throws {Error}     - Thrown when the On characteristic cannot be found on the service.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    _getAccessorySwitchState(switchService) {
        // Validate arguments
        if ((switchService === undefined) || !(switchService instanceof _hap.Service.Switch)) {
            throw new TypeError('\'switchService\' must be a _hap.Service.Switch');
        }

        let result = false;
        const charOn = switchService.getCharacteristic(_hap.Characteristic.On);
        if (charOn !== undefined) {
            result = charOn.value;
        }
        else {
            throw new Error(`The '${switchService.displayName}.${switchService.udst}' service  does not have an On charactristic.`);
        }

        return result;
    }

    // eslint-disable-next-line indent
 /* ========================================================================
    Description: Helper to specify the HAP Service Type from the
                 FIXED_ACCESSORY_SERICE_TYPES enumeration.

    @param {enum:FIXED_ACCESSORY_SERVICE_TYPES} [service_type] - Type of the service to get.

    @return - the HAP Service type.

    @throws {TypeError} - Thrown if 'service_type' is not a FIXED_ACCESSORY_SERVICE_TYPES value.
    ======================================================================== */
    // eslint-disable-next-line class-methods-use-this
    _getAccessoryServiceType(serviceType) {
        // Validate arguments
        if ((serviceType === undefined) || (typeof(serviceType) !== 'number') ||
            (Object.values(FIXED_ACCESSORY_SERVICE_TYPES).indexOf(serviceType) < 0)) {
            throw new TypeError(`service_type not a member of FIXED_ACCESSORY_SERVICE_TYPES. ${serviceType}`);
        }

        let rtnVal;

        switch (serviceType) {
            case FIXED_ACCESSORY_SERVICE_TYPES.Switch: {
                rtnVal = _hap.Service.Switch;
            }
            // eslint-disable-next-line indent
            break;

            default: {
                // Not handled. Should never happen !!
                throw new Error(`This cannot happen !! service_type=${serviceType}`);
            }
        }

        return rtnVal;
    }
}

/* Default Export Function for integrating with Homebridge */
/* ========================================================================
   Description: Exported default function for Homebridge integration.

   Parameters:  homebridge: reference to the Homebridge API.

   Return:      None
   ======================================================================== */
var main = (homebridgeAPI) => {
    _debug(`homebridge API version: v${homebridgeAPI.version}`);

    // Accessory must be created from PlatformAccessory Constructor
    _PlatformAccessory  = homebridgeAPI.platformAccessory;
    if (!Object.prototype.hasOwnProperty.call(_PlatformAccessory, 'PlatformAccessoryEvent')) {
        // Append the PlatformAccessoryEvent.IDENTITY enum to the platform accessory reference.
        // This allows us to not need to import anything from 'homebridge'.
        const platformAccessoryEvent = {
            IDENTIFY: 'identify',
        };

        _PlatformAccessory.PlatformAccessoryEvent = platformAccessoryEvent;
    }

    // Cache the reference to hap-nodejs
    _hap                = homebridgeAPI.hap;

    // Register the paltform.
    _debug(`Registering platform: ${PLATFORM_NAME}`);
    homebridgeAPI.registerPlatform(PLATFORM_NAME, VolumeInterrogatorPlatform);
};

exports["default"] = main;
