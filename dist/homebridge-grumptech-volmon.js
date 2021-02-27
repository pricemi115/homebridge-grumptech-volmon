'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

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

/* ==========================================================================
   File:               spawnHelper.js
   Class:              Spawn Helper
   Description:	       Wrapper for managing spawned tasks.
   Copyright:          Dec 2020
   ========================================================================== */

// External dependencies and imports.
const _debug    = require('debug')('spawn_helper');
const { spawn } = require('child_process');

// Bind debug to console.log
_debug.log = console.log.bind(console);

/* ==========================================================================
   Class:              SpawnHelper
   Description:	       Wrapper class for handling spawned tasks
   Copyright:          Dec 2020

   @event 'complete' => function({object})
   @event_param {bool}              [valid]  - Flag indicating if the spawned task completed successfully.
   @event_param {<Buffer>}          [result] - Buffer of the data or error returned by the spawned process.
   #event_param {<SpawnHelper>}     [source] - Reference to *this* SpawnHelper that provided the results.
   Event emmitted when the spawned task completes.
   ========================================================================== */
class SpawnHelper extends EventEmitter {
 /* ========================================================================
    Description:    Constructor

    @param {object} [config] - Not used.

    @return {object}  - Instance of the SpawnHelper class.

    @throws {TypeError}  - thrown if the configuration is not undefined.
    ======================================================================== */
    constructor(config) {
        if (config !== undefined) {
            throw new TypeError(`SpawnHelper does not use any arguments.`);
        }

        // Initialize the base class.
        super();

        // Initialize data members.
        this._command           = undefined;
        this._arguments         = undefined;
        this._options           = undefined;
        this._result_data       = undefined;
        this._error_data        = undefined;
        this._error_encountered = false;
        this._pending           = false;

        // Bound Callbacks
        this._CB__process_stdout_data   = this._process_stdout_data.bind(this);
        this._CB__process_stderror_data = this._process_stderror_data.bind(this);
        this._CB_process_message        = this._process_message.bind(this);
        this._CB_process_error          = this._process_error.bind(this);
        this._CB_process_close          = this._process_close.bind(this);
    }

 /* ========================================================================
    Description: Read-Only Property accessor to read the pending flag for this
                 item.

    @return {bool} - true if processing of this item is pending.
    ======================================================================== */
    get IsPending() {
        return ( this._pending );
    }
 
 /* ========================================================================
    Description: Read-Only Property accessor to read the valid flag for this
                 item.

    @return {bool} - true if processing completed successfully.
    ======================================================================== */
    get IsValid() {
        return ( (this._command !== undefined) && 
                 !this.IsPending && !this._error_encountered );
    }

 /* ========================================================================
    Description: Read-Only Property accessor to read the result data for this
                 item.

    @return {<Buffer>} - Data collected from the spawn process. 
                         Unreliable and/or undefined if processing was not successful.
    ======================================================================== */
    get Result() {
        return ( this._result_data );
    }

 /* ========================================================================
    Description: Read-Only Property accessor to read the error data for this
                 item.

    @return {<Buffer>} - Error data collected from the spawn process. 
                         Unreliable and/or undefined if processing completed successfully.
    ======================================================================== */
    get Error() {
        return ( this._error_data );
    }

 /* ========================================================================
    Description: Read-Only Property accessor to read the spawn command for this
                 item.

    @return {string} - Current command for the spawn process.
    ======================================================================== */
    get Command() {
        return ( this._command );
    }

 /* ========================================================================
    Description: Read-Only Property accessor to read the spawn arguments for
                 this item.

    @return {[string]]} - Current command arguments for the spawn process.
    ======================================================================== */
    get Arguments() {
        return ( this._arguments );
    }

 /* ========================================================================
    Description: Read-Only Property accessor to read the spawn options for
                 this item.

    @return {[string]]} - Current command options for the spawn process.
    ======================================================================== */
    get Options() {
        return ( this._options );
    }

 /* ========================================================================
    Description:    Initiate spawned process

    @param {object}    [request]           - Spawn command data
    @param {string}    [request.command]   - Spawn command     (required)
    @param {[string]}  [request.arguments] - Spawn arguments   (optional)
    @param {[string]}  [request.options]   - Spawn options     (optional)

    @return {bool}  - true if child process is spawned

    @throws {TypeError}  - arguments are not of the expected type. 
    @throws {Error}      - Spawn invoked when an existing spawn is still pending.
    ======================================================================== */
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
        if ( (!request.hasOwnProperty('command'))   ||
             (typeof(request.command) !== 'string') ||
             (request.command.length <= 0)            ) {
            throw new TypeError('request.command must be a non-zero length string.');
        }
        // If we got this far, then request.command mus be legit.
        this._command = request.command;

        // Validate 'optional' arguments request
        if (request.hasOwnProperty('arguments')) {
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
        if (request.hasOwnProperty('options')) {
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

        // Reset the internal data
        this._result_data       = undefined;
        this._error_data        = undefined;
        this._error_encountered = false;
        this._pending           = true;  // Think positive :)

        // Spawn the request
        const childProcess = spawn(this._command, this._arguments, this._options);
        // Register for the stdout.data notifications
        childProcess.stdout.on('data', this._CB__process_stdout_data);
        // Register for the stderr.data notifications
        childProcess.stderr.on('data', this._CB__process_stderror_data);
        // Register for the message notification
        childProcess.on('message', this._CB_process_message);
        // Register for the error notification
        childProcess.on('error', this._CB_process_error );        
        // Register for the close notification
        childProcess.on('close', this._CB_process_close);
    }

 /* ========================================================================
    Description:    Event handler for the STDOUT Data Notification

    @param { <Buffer> | <string> | <any>} [chunk] - notification data
    ======================================================================== */
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

 /* ========================================================================
    Description:    Event handler for the STDERR Data Notification

    @param { <Buffer> | <string> | <any>} [chunk] - notification data
    ======================================================================== */
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

 /* ========================================================================
    Description:    Event handler for the Child Process Message Notification

    @param { <Object> } [message]      - A parsed JSON object or primitive value.
    @param { <Handle> } [sendHandle]   - Handle
    ======================================================================== */
    _process_message(message, sendHandle) {
        // TODO: Not sure if I need this.
        _debug(`Child Process for ${this.Command}: '${message}'`);
    }

 /* ========================================================================
    Description:    Event handler for the Child Process Error Notification

    @param { <Error> } [error] - The error
    ======================================================================== */
    _process_error(error) {
        // Log the error info.
        _debug(`Child Process for ${this.Command}: error_num:${errror.number} error_name:${error.name} error_msg:${error.message}`);

        // Ensure that the error is recorded.
        this._error_encountered = true;
    }

 /* ========================================================================
    Description:    Event handler for the Child Process Close Notification

    @param { <number> } [code]   - The exit code if the child exited on its own.
    @param { <string> } [signal] - The signal by which the child process was terminated. 
    ======================================================================== */
    _process_close(code, signal) {
        // Log the close info.
        _debug(`Child Process for ${this.Command}: exit_code:${code} by signal:'${signal}'`);

        // Indicate that we are done.
        this._pending = false;

        // Notify our clients.
        const isValid = this.IsValid;
        const response = {valid:isValid, result:(isValid ? this.Result : this.Error), source:this};
        this.emit('complete', response);
    }   
}

/* ==========================================================================
   File:               volumeData.js
   Class:              Volume Data
   Description:	       Provides read/write access to data metrics of interest.
   Copyright:          Dec 2020
   ========================================================================== */

// External dependencies and imports.
const _debug$1 = require('debug')('vol_data');

// Bind debug to console.log
_debug$1.log = console.log.bind(console);

// Helpful constants and conversion factors.
const BYTES_TO_GB_BASE2     = (1024.0 * 1024.0 * 1024.0);
const BYTES_TO_GB_BASE10    = (1000.0 * 1000.0 * 1000.0);
const BLOCK_1K_TO_BYTES     = 1024.0;

 /* ========================================================================
    Description:    Enumeration of supported file systems
    ======================================================================== */
const VOLUME_TYPES = {
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
const CONVERSION_BASES = {
    BASE_2  : 2,
    BASE_10 : 10
};

/* ==========================================================================
   Class:              VolumeData
   Description:	       Provides data of interest for volumes.
   Copyright:          Dec 2020
   ========================================================================== */
class VolumeData {
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

        // Update values from data passed in.
        if (data !== undefined) {
            if (typeof(data) != 'object') {
                throw new TypeError(`'data' must be an object`);
            }
            if (data.hasOwnProperty('name') &&
                (typeof(data.name) === 'string')) {
                name = data.name;
            }
            if (data.hasOwnProperty('disk_id') &&
                (typeof(data.disk_id) === 'string')) {
                diskIdentifier = data.disk_id;
            }
            if (data.hasOwnProperty('volume_type') &&
                (typeof(data.volume_type) === 'string')) {
                if (Object.values(VOLUME_TYPES).includes(data.volume_type)) {
                    volumeType = data.volume_type;
                }
                else {
                    throw new RangeError(`Unrecognized volume type specified. (${data.volume_type})`);
                }
            }
            if (data.hasOwnProperty('mount_point') &&
                (typeof(data.mount_point) === 'string')) {
                mountPoint = data.mount_point;
            }
            if (data.hasOwnProperty('capacity_bytes') &&
                (typeof(data.capacity_bytes) === 'number')) {
                if (data.capacity_bytes > 0) {
                    capacityBytes = data.capacity_bytes;
                }
                else {
                    throw new RangeError(`Volume size must be a positive number. (${data.capacity_bytes})`);
                }
            }
            if (data.hasOwnProperty('device_node') &&
                (typeof(data.device_node) === 'string')) {
                deviceNode = data.device_node;
            }
            if (data.hasOwnProperty('volume_uuid') &&
                (typeof(data.volume_uuid) === 'string')) {
                volumeUUID = data.volume_uuid;
            }
            if (data.hasOwnProperty('free_space_bytes') &&
                (typeof(data.free_space_bytes) === 'number')) {
                if (data.free_space_bytes >= 0) {
                    freeSpaceBytes = data.free_space_bytes;
                }
                else {
                    throw new RangeError(`Volume size must be greater than or equal to 0. (${data.free_space_bytes})`);
                }
            }
            if (data.hasOwnProperty('used_space_bytes') &&
                (typeof(data.used_space_bytes) === 'number')) {
                if (data.used_space_bytes >= 0) {
                    usedSpaceBytes = data.used_space_bytes;
                }
                else {
                    throw new RangeError(`Volume size must be greater than or equal to 0. (${data.used_space_bytes})`);
                }
            }
            if (data.hasOwnProperty('visible') &&
                (typeof(data.visible) === 'boolean')) {
                visible = data.visible;
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

/* ==========================================================================
   File:               volumeInterrogator.js
   Class:              Volume Interrogator
   Description:	       Interrogates the system to determine properties and
                       attribures of interest for volumes.
   Copyright:          Dec 2020
   ========================================================================== */

// External dependencies and imports.
const _debug_process    = require('debug')('vi_process');
const _debug_config     = require('debug')('vi_config');
const _plist            = require('plist');

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
class VolumeInterrogator extends EventEmitter {
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
                    let volumesPartitions = [];
                    let volumesAFPS       = [];
                    let volumesRoot       = [];
                    const allDisksAndParts = config.AllDisksAndPartitions;

                    // Iterate over the disks and partitoins and gather the HFS+ and AFPS entries.
                    for (const item of allDisksAndParts) {
                        if (item.hasOwnProperty('Content')) {
                            if ((item.hasOwnProperty('APFSPhysicalStores')) &&
                                (item.hasOwnProperty('APFSVolumes'))) {
                                // Append to the AFPS list
                                volumesAFPS.push(item);
                            }
                            else if ((item.hasOwnProperty('Partitions')) &&
                                     (item.Partitions.length > 0)) {
                                // Append to the Partitions list
                                volumesPartitions.push(item);
                            }
                            else {
                                // This volume is at the root of AllDisksAndPartitions and has no child volume items.
                                // Validate that we can access the disk identifier.
                                if ((item.hasOwnProperty('DeviceIdentifier') &&
                                    (typeof(item.DeviceIdentifier) === 'string'))) {
                                        // Record the identifier.
                                        volumesRoot.push(item.DeviceIdentifier);
                                }
                                else {
                                    throw new TypeError(`partition is not as expected. Missing or Invalid Disk Identifier.`);
                                }
                            }
                        }
                        else {
                            _debug_process('No Content entry');
                        }
                    }

                    // Get a list of disk identifiers for the partition-based (HFS+, UDF, Partitioned Volumes) volumes.
                    const partitionDiskIdentifiers  = this._partitionDiskIdentifiers(volumesPartitions);
                    // Get a list of disk identifiers for the AFPS Volumes.
                    const apfsDiskIdentifiers       = this._apfsDiskIdentifiers(volumesAFPS);

                    // Combine the lists of disk identifiers.
                    this._pendingVolumes = volumesRoot.concat(partitionDiskIdentifiers);
                    this._pendingVolumes = this._pendingVolumes.concat(apfsDiskIdentifiers);

                    // Iterate over the disk ids and spawn a 'diskutil info' request.
                    for (const diskId of this._pendingVolumes) {
                        _debug_process(`Initiating 'diskutil info' for DiskId '${diskId}'`);
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

                // Get the device identifier for this volume and manage the pending
                // items.
                if ((config.hasOwnProperty('DeviceIdentifier')) && (typeof(config.DeviceIdentifier) === 'string') &&
                    (this._pendingVolumes.includes(config.DeviceIdentifier))) {
                    // First, remove this item from the pending list.
                    this._pendingVolumes = this._pendingVolumes.filter( (item) => {
                        return item !== config.DeviceIdentifier;
                    });

                    // Validate the config data.
                    if ((config.hasOwnProperty('VolumeName') &&          (typeof(config.VolumeName)          === 'string'))       &&
                        (config.hasOwnProperty('FilesystemType') &&      (typeof(config.FilesystemType)      === 'string'))       &&
                        (config.hasOwnProperty('DeviceIdentifier') &&    (typeof(config.DeviceIdentifier)    === 'string'))       &&
                        (config.hasOwnProperty('MountPoint') &&          (typeof(config.MountPoint)          === 'string'))       &&
                        (config.hasOwnProperty('DeviceNode') &&          (typeof(config.DeviceNode)          === 'string'))       &&
                        /* UDF volumes have no Volume UUID */
                        ( (config.hasOwnProperty('VolumeUUID') &&        (typeof(config.VolumeUUID)          === 'string'))    ||
                          (!config.hasOwnProperty('VolumeUUID')) )                                                                &&
                        (config.hasOwnProperty('Size') &&                (typeof(config.Size)                === 'number'))       &&
                        // Free space is reported based on the file system type.
                        ( ((config.hasOwnProperty('FreeSpace') &&         (typeof(config.FreeSpace)          === 'number')))   ||
                           (config.hasOwnProperty('APFSContainerFree') && (typeof(config.APFSContainerFree)  === 'number')) ))      {

                            // Then, process the data provided.
                            // Free space is reported based on the file system type.
                            const freeSpace  = ((config.FilesystemType === VOLUME_TYPES.TYPE_APFS) ? config.APFSContainerFree : config.FreeSpace);
                            // For volumes that do not have a volume UUID, use the device node.
                            const volumeUUID = ((config.hasOwnProperty('VolumeUUID')) ? config.VolumeUUID : config.DeviceNode);
                            const volData = new VolumeData({name:               config.VolumeName,
                                                            volume_type:        config.FilesystemType,
                                                            disk_id:            config.DeviceIdentifier,
                                                            mount_point:        config.MountPoint,
                                                            capacity_bytes:     config.Size,
                                                            device_node:        config.DeviceNode,
                                                            volume_uuid:        volumeUUID,
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
                    }
                    else {
                        // Ignore the inability to process this item if there is no valid volume name.
                        if ((config.hasOwnProperty('VolumeName') && (typeof(config.VolumeName) === 'string') &&
                            (config.VolumeName.length > 0))) {
                            _debug_process(`_on_process_diskutil_info_complete: Unable to handle response from diskutil.`);
                            throw new TypeError('Missing or invalid response from diskutil.');
                        }
                    }

                    // Finally, update the 'check in progress' flag.
                    this._updateCheckInProgress();
                }
                else {
                    throw new Error(`Unexpected call to _on_process_diskutil_info_complete. config:${config}`);
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
            if ((disk.hasOwnProperty('Partitions')) &&
                (disk.Partitions.length > 0)) {
                for (const partition of disk.Partitions) {
                    // Validate that we can access the disk identifier.
                    if ((partition.hasOwnProperty('DeviceIdentifier') &&
                        (typeof(partition.DeviceIdentifier) === 'string'))) {
                            // Record the identifier.
                            diskIdentifiers.push(partition.DeviceIdentifier);
                    }
                    else {
                        throw new TypeError(`partition is not as expected. Missing or Invalid Disk Identifier.`);
                    }
                }
            }
            else {
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

/* ==========================================================================
   File:               main.js
   Description:	       Homebridge integration for Volume Monitor
   Copyright:          Jan 2021
   ========================================================================== */

const _debug$2 = require('debug')('homebridge');

// Configuration constants.
const PLUGIN_NAME   = config_info.plugin;
const PLATFORM_NAME = config_info.platform;

// Internal Constants
const DEFAULT_LOW_SPACE_THRESHOLD   = 15.0;
const MIN_LOW_SPACE_THRESHOLD       = 0.0;
const MAX_LOW_SPACE_THRESHOLD       = 100.0;
const MANUAL_REFRESH_SWITCH_NAME    = 'Refresh';

// Accessory must be created from PlatformAccessory Constructor
let _PlatformAccessory  = undefined;
// Service and Characteristic are from hap-nodejs
let _hap                = undefined;

/* Default Export Function for integrating with Homebridge */
/* ========================================================================
   Description: Exported default function for Homebridge integration.

   Parameters:  homebridge: reference to the Homebridge API.

   Return:      None
   ======================================================================== */
var main = (homebridgeAPI) => {
    _debug$2(`homebridge API version: v${homebridgeAPI.version}`);

    // Accessory must be created from PlatformAccessory Constructor
    _PlatformAccessory  = homebridgeAPI.platformAccessory;
    if (!_PlatformAccessory.hasOwnProperty('PlatformAccessoryEvent')) {
        // Append the PlatformAccessoryEvent.IDENTITY enum to the platform accessory reference.
        // This allows us to not need to import anything from 'homebridge'.
        const platformAccessoryEvent = {
            IDENTIFY: "identify",
        };

        _PlatformAccessory.PlatformAccessoryEvent = platformAccessoryEvent;
    }

    // Cache the reference to hap-nodejs
    _hap                = homebridgeAPI.hap;

    // Register the paltform.
    _debug$2(`Registering platform: ${PLATFORM_NAME}`);
    homebridgeAPI.registerPlatform(PLATFORM_NAME, VolumeInterrogatorPlatform);
};

/* ==========================================================================
   Class:              VolumeInterrogatorPlatform
   Description:	       Homebridge platform for managing the Volume Interrogator
   Copyright:          Jan 2021
   ========================================================================== */
class VolumeInterrogatorPlatform {
 /* ========================================================================
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
        this._name = this._config['name'];
        this._alarmThreshold = DEFAULT_LOW_SPACE_THRESHOLD;

        // Underlying engine
        this._volumeInterrogator = new VolumeInterrogator();

        // Reference to the "Refresh" accessory switch.
        this._switchRefresh = undefined;

        /* Bind Handlers */
        this._bindDoInitialization          = this._doInitialization.bind(this);
        this._bindDestructorNormal          = this._destructor.bind(this, {cleanup:true});
        this._bindDestructorAbnormal        = this._destructor.bind(this, {exit:true});
        this._CB_VolumeIterrrogatorReady    = this._handleVolumeInterrogatorReady.bind(this);

        /* Log our creation */
        this._log(`Creating VolumeInterrogatorPlatform`);

        /* Create an empty map for our accessories */
        this._accessories = new Map();

        /* Create an empty map for our volume data.
           Using a Map to allow for easy updates/replacements */
        this._volumesData = new Map();

        // Register for the Did Finish Launching event
        this._api.on('didFinishLaunching', this._bindDoInitialization);
        this._api.on('shutdown', this._bindDestructorNormal);

        // Register for shutdown events.
        //do something when app is closing
        process.on('exit', this._bindDestructorNormal);
        //catches uncaught exceptions
        process.on('uncaughtException', this._bindDestructorAbnormal);

        // Register for Volume Interrogator events.
        this._volumeInterrogator.on('ready', this._CB_VolumeIterrrogatorReady);

    }

 /* ========================================================================
    Description: Destructor

    @param {object} [options]  - Typically containing a "cleanup" or "exit" member.
    @param {object} [err]      - The source of the event trigger.
    ======================================================================== */
    async _destructor(options, err) {
        // Is there an indication that the system is either exiting or needs to
        // be cleaned up?
        if ((options.exit) || (options.cleanup)) {
            // Cleanup the garage controller system.
            if (this._volumeInterrogator != undefined) {
                this._log.debug(`Terminating the volume interrogator.`);
                await this._volumeInterrogator.Stop();
                this._volumeInterrogator = undefined;
            }
        }
    }

 /* ========================================================================
    Description: Event handler when the system has loaded the platform.

    @throws {TypeError}  - thrown if the 'polling_interval' configuration item is not a number.
    @throws {RangeError} - thrown if the 'polling_interval' configuration item is outside the allowed bounds.

    @remarks:     Opportunity to initialize the system and publish accessories.
    ======================================================================== */
    async _doInitialization() {

        this._log(`Homebridge Plug-In ${PLATFORM_NAME} has finished launching.`);

        let theSettings = undefined;
        if (this._config.hasOwnProperty('settings')) {
            // Get the system configuration,
            theSettings = this._config.settings;
        }

        // Check for Settings
        if (theSettings != undefined) {
            // Polling Interval {Hours}
            if ((theSettings.hasOwnProperty('polling_interval')) &&
                (typeof(theSettings.polling_interval) === 'number')) {
                if ((theSettings.polling_interval >= this._volumeInterrogator.MinimumPeriod) &&
                    (theSettings.polling_interval <= this._volumeInterrogator.MaximumPeriod)) {
                    // Set the period (in hours)
                     this._volumeInterrogator.Period = theSettings.polling_interval;
                }
                else {
                    throw new RangeError(`Configuration item 'polling_interval' must be between ${this._volumeInterrogator.MinimumPeriod} and ${this._volumeInterrogator.MaximumPeriod}. {${theSettings.polling_interval}}`);
                }
            }
            else {
                throw new TypeError(`Configuration item 'polling_interval' must be a number. {${typeof(theSettings.polling_interval)}}`);
            }
            // Low Space Alarm Threshold {Percent}
            if ((theSettings.hasOwnProperty('alarm_threshold')) &&
                (typeof(theSettings.alarm_threshold) === 'number')) {
                if ((theSettings.alarm_threshold > MIN_LOW_SPACE_THRESHOLD) &&
                    (theSettings.alarm_threshold < MAX_LOW_SPACE_THRESHOLD)) {
                    // Set the period (in hours)
                    this._alarmThreshold = theSettings.alarm_threshold;
                }
                else {
                    throw new RangeError(`Configuration item 'alarm_threshold' must be between ${MIN_LOW_SPACE_THRESHOLD} and ${MAX_LOW_SPACE_THRESHOLD}. {${theSettings.alarm_threshold}}`);
                }
            }
            else {
                throw new TypeError(`Configuration item 'alarm_threshold' must be a number. {${typeof(theSettings.alarm_threshold)}}`);
            }
        }

        // We have no need to be aware of the past.
        // If accessories were restored, flush them away
        this._removeAccessories(false);

        // Determine if the Manual Refresh accessory already exists.
        for (const accessory of this._accessories.values()) {
            const switchRefresh = accessory.getService(MANUAL_REFRESH_SWITCH_NAME);
            if (switchRefresh !== undefined)
            {
                // We found the Manual Redresh Switch.
                this._switchRefresh = accessory;
            }
        }
        // Creste the Manual Refresh switch accessory if needed.
        if (this._switchRefresh === undefined) {
            // Manual Refresh switch never existed. Make one now.
            // uuid must be generated from a unique but not changing data source, theName should not be used in the most cases. But works in this specific example.
            const uuid = _hap.uuid.generate(MANUAL_REFRESH_SWITCH_NAME);
            this._switchRefresh = new _PlatformAccessory(MANUAL_REFRESH_SWITCH_NAME, uuid);
            // Create our services.
            this._switchRefresh.addService(_hap.Service.Switch, MANUAL_REFRESH_SWITCH_NAME);

            // Update the accessory information.
            this._updateAccessoryInfo(this._switchRefresh, {model:'refresh switch', serialnum:'00000001'});

            // register the manual refresh switch
            this._api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this._switchRefresh]);
        }
        // configure this accessory.
        this._configureAccessory(this._switchRefresh);
        // Set the wwitch to on while we wait for a response.
        const serviceSwitch = this._switchRefresh.getService(MANUAL_REFRESH_SWITCH_NAME);
        if (serviceSwitch !== undefined) {
            serviceSwitch.updateCharacteristic(_hap.Characteristic.On, true);
        }

        // Start interrogation.
        this._volumeInterrogator.Start();
    }

 /* ========================================================================
    Description: Homebridge API invoked after restoring cached accessorues from disk.

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory
    ======================================================================== */
    configureAccessory(accessory) {

        // This application has no need for history of the Battery Service accessories..
        // But we will record them anyway to remove them once the accessory loads.
        let found = false;
        for (const acc of this._accessories.values()) {
            if (acc === accessory) {
                found = true;
                break;
            }
        }
        if (!found) {
            this._accessories.set(accessory.displayName, accessory);
        }
    }

 /* ========================================================================
    Description: Event handler for the Volume Interrogator Ready event.

    @param {object} [data] - object containing a 'results' item which is an array of volume data results.

    @throws {TypeError} - Thrown when 'results' is not an Array of VolumeData objects.
    ======================================================================== */
    _handleVolumeInterrogatorReady(data) {
        // Validate the parameters.
        if ((data === undefined) ||
            (!data.hasOwnProperty('results'))) {
            throw new TypeError(`'data' needs to be an object with a 'results' field.`);
        }
        if (!Array.isArray(data.results)) {
            throw new TypeError(`'data.results' needs to be an array of VolumeData objects.`);
        }
        for (const result of data.results) {
            if ( !(result instanceof VolumeData) ) {
                throw new TypeError(`'results' needs to be an array of VolumeData objects.`);
            }
        }

        for (const result of data.results) {
            if (result.IsMounted) {
                this._log.debug(`\tName:${result.Name.padEnd(20, ' ')}\tVisible:${result.IsVisible}\tSize:${VolumeData.ConvertFromBytesToGB(result.Size).toFixed(4)} GB\tUsed:${((result.UsedSpace/result.Size)*100.0).toFixed(2)}%\tMnt:${result.MountPoint}`);
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
                if ((volData.IsVisible) &&
                    (!volIsKnown)) {
                    // Does not exist. Add it
                    this._addBatteryServiceAccessory(volData.Name);
                }

                // Update the accessory if we know if this volume already
                // (i.e. it is currently or was previously visible to us).
                const theAccessory = this._accessories.get(volData.Name);
                if (theAccessory !== undefined) {
                    this._updateBatteryServiceAccessory(theAccessory);
                }
            }
            catch(error) {
                this._log.debug(`Error when managing accessory: ${volData.Name}`);
                console.log(error);
            }
        }

        // Ensure the switch is turned back off.
        const serviceSwitch = this._switchRefresh.getService(MANUAL_REFRESH_SWITCH_NAME);
        if (serviceSwitch !== undefined) {
            serviceSwitch.updateCharacteristic(_hap.Characteristic.On, false);
        }

        // With the accessories that remain, force an update.
        let accessoryList = [];
        for (const accessory of this._accessories.values()) {
            accessoryList.push(accessory);
        }
        // Update, if needed.
        if (accessoryList.length > 0) {
            this._api.updatePlatformAccessories(accessoryList);
        }
    }

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
            throw new TypeError(`name must be a string`);
        }
         if (name.length <= 0) {
            throw new RangeError(`name must be a non-zero length string.`);
        }
        if (this._accessories.has(name)) {
            throw new Error(`Accessory '${name}' is already registered.`);
        }

        this._log.debug(`Adding new accessory: name:'${name}'`);

        // uuid must be generated from a unique but not changing data source, theName should not be used in the most cases. But works in this specific example.
        const uuid = _hap.uuid.generate(name);
        const accessory = new _PlatformAccessory(name, uuid);

        // Create our services.
        accessory.addService(_hap.Service.BatteryService, name);

        try {
            // Configura the accessory
            this._configureAccessory(accessory);
        }
        catch (error) {
            this._log.debug(`Error when configuring accessory.`);
            console.log(error);
        }

        this._api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

 /* ========================================================================
    Description: Internal function to perform accessory configuration and internal 'registration' (appending to our list)

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory

    @remarks:     Opportunity to setup event handlers for characteristics and update values (as needed).
    ======================================================================== */
    _configureAccessory(accessory) {

        if ((accessory === undefined) ||
            (!(accessory instanceof _PlatformAccessory))) {
            throw new TypeError(`accessory must be a PlatformAccessory`);
        }

        this._log.debug("Configuring accessory %s", accessory.displayName);

        // Register to handle the Identify request for the accessory.
        accessory.on(_PlatformAccessory.PlatformAccessoryEvent.IDENTIFY, () => {
            this._log("%s identified!", accessory.displayName);
        });

        // Does this accessory have a Switch service?
        const serviceSwitch = accessory.getService(_hap.Service.Switch);
        if (serviceSwitch !== undefined) {
            const charOn = serviceSwitch.getCharacteristic(_hap.Characteristic.On);
            // Register for the "get" event notification.
            charOn.on('get', this._handleOnGet.bind(this, accessory));
            // Register for the "get" event notification.
            charOn.on('set', this._handleOnSet.bind(this, accessory));
        }

        // Is this accessory new to us?
        if (!this._accessories.has(accessory.displayName)){
            // Update our accessory listing
            this._log.debug(`Adding accessory '${accessory.displayName} to the accessories list. Count:${this._accessories.size}`);
            this._accessories.set(accessory.displayName, accessory);
        }
    }

 /* ========================================================================
    Description: Remove/destroy an accessory

    @param {object} [accessory] - accessory to be removed.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory.
    @throws {RangeError} - Thrown when a 'accessory' is not registered.
    ======================================================================== */
    _removeAccessory(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }
        if (!this._accessories.has(accessory.displayName)) {
            throw new RangeError(`Accessory '${accessory.displayName}' is not registered.`);
        }

        this._log.debug(`Removing accessory '${accessory.displayName}'`);

        // Event Handler cleanup.
        accessory.removeAllListeners(_PlatformAccessory.PlatformAccessoryEvent.IDENTIFY);
        // Does this accessory have a Switch service?
        const serviceSwitch = accessory.getService(_hap.Service.Switch);
        if (serviceSwitch !== undefined) {
            const charOn = serviceSwitch.getCharacteristic(_hap.Characteristic.On);
            // Register for the "get" event notification.
            charOn.off('get', this._handleOnGet.bind(this, accessory));
            // Register for the "get" event notification.
            charOn.off('set', this._handleOnSet.bind(this, accessory));
        }

        /* Unregister the accessory */
        this._api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        /* remove the accessory from our mapping */
        this._accessories.delete(accessory.displayName);
    }

 /* ========================================================================
    Description: Removes all of the `Battery Service` platform accessories.

    @param {bool} [removeAll] - Flag indicating if all accessories should be
                                removed, or only accessories with a Battery Service.
    ======================================================================== */
    _removeAccessories(removeAll) {

        this._log.debug(`Removing Accessories: removeAll:${removeAll}`);

        // Make a list of accessories to be deleted.
        let purgeList = [];
        for (const accessory of this._accessories.values()) {
            // Filter the accessories for the Battery Service accessories.
            const batteryService = accessory.getService(_hap.Service.BatteryService);
            if ((removeAll) ||
                (batteryService !== undefined)) {
                purgeList.push(accessory);
            }
        }
        // Clean up
        for (const accessory of purgeList) {
            this._removeAccessory(accessory);
        }
    }

 /* ========================================================================
    Description: Update an accessory

    @param {object} [accessory] - accessory to be updated.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    ======================================================================== */
    _updateBatteryServiceAccessory(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
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

            if (volData.IsVisible) {

                 // Compute the fraction of space remaining.
                percentFree = ((volData.FreeSpace/volData.Size)*100.0).toFixed(0);
                // Determine if the remaining space threshold has been exceeded.
                lowAlert = (percentFree < this._alarmThreshold);

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
        this._updateAccessoryInfo(accessory, {model:theModel, serialnum:theSerialNumber});
    }

 /* ========================================================================
    Description: Update an accessory

    @param {object} [accessory] - accessory to be updated.

    @param {object} [info]                      - accessory information.
    @param {string | Error} [info.model]        - accessory model number
    @param {string | Error} [info.serialnum]    - accessory serial number.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    @throws {TypeError} - Thrown when 'info' is not undefined, does not have the 'model' or 'serialnum' properties
                          or the properties are not of the expected type.
    ======================================================================== */
    _updateAccessoryInfo(accessory, info) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }
        if ((info === undefined) ||
            (!info.hasOwnProperty('model'))     || ((typeof(info.model)      !== 'string') || (info.model instanceof Error)) ||
            (!info.hasOwnProperty('serialnum')) || ((typeof(info.serialnum)  !== 'string') || (info.model instanceof Error))   ) {
            throw new TypeError(`info must be an object with properties named 'model' and 'serialnum' that are eother strings or Error`);
        }

        /* Get the accessory info service. */
        const accessoryInfoService = accessory.getService(_hap.Service.AccessoryInformation);
        if (accessoryInfoService != undefined)
        {
            /* Manufacturer */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Manufacturer, `GrumpTech`);

            /* Model */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Model, info.model);

            /* Serial Number */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.SerialNumber, info.serialnum);
        }
    }

 /* ========================================================================
    Description: Event handler for the "get" event for the Switch.On characteristic.

    @param {object} [accessory] - accessory being querried.

    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    ======================================================================== */
    _handleOnGet(accessory, callback) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }

        this._log.debug(`Switch '${accessory.displayName}' Get Request.`);

        let status = null;
        let result = undefined;
        try {
            result = this._getAccessorySwitchState(accessory);
        }
        catch (err) {
            this._log.debug(`  Unexpected error encountered: ${err.message}`);
            result = false;
            status = new Error(`Accessory ${accessory.displayName} is not ressponding.`);
        }

        // Invoke the callback function with our result.
        callback(status, result);
    }

 /* ========================================================================
    Description: Event handler for the "set" event for the Switch.On characteristic.

    @param {object} [accessory] - accessory being querried.
    @param {bool} [value]           - new/rewuested state of the switch
    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    ======================================================================== */
    _handleOnSet(accessory, value, callback) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }

        this._log.debug(`Switch '${accessory.displayName}' Set Request. New state:${value}`);

        let status = null;
        try {

            // The processing of the request to set a switch is context (accessory) specific.
            if (accessory === this._switchRefresh) {
                const currentValue = this._getAccessorySwitchState(accessory);

                // The user is not allowed to turn the switch off.
                // It will auto reset when the current check is complete.
                if ( (!value) && (currentValue))
                {
                    // Attempting to turn the switch from on to off.
                    // Not permitted.
                    this._log.debug(`Unable to turn the '${accessory.displayName}' switch off.`);
                    status = new Error(`Unable to turn the '${accessory.displayName}' switch off.`);

                    // Decouple setting the switch back on.
                    setImmediate((accy, resetVal) => {
                        const serviceSwitch = accy.getService(MANUAL_REFRESH_SWITCH_NAME);
                        if (serviceSwitch !== undefined) {
                            this._log.debug(`Switch '${accy.displayName}' Restoring state ${resetVal}`);
                            serviceSwitch.updateCharacteristic(_hap.Characteristic.On, resetVal);
                        }
                     }, accessory, currentValue);
                }
                else {
                    // The change is permitted.
                    // If the switch was turned on, then intiate a volume refresh.
                    if (value) {
                        this._volumeInterrogator.Start();
                    }
                }
            }
        }
        catch (err) {
            this._log.debug(`  Unexpected error encountered: ${err.message}`);

            status = new Error(`Accessory ${accessory.displayName} is not ressponding.`);
        }

        callback(status);
    }

 /* ========================================================================
    Description: Get the value of the Service.Switch.On characteristic value

    @param {object} [accessory] - accessory being querried.

    @return - the value of the On characteristic (true or false)

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    @throws {Error}     - Thrown when the switch service or On characteristic cannot
                          be found on the accessory.
    ======================================================================== */
    _getAccessorySwitchState(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }

        let result = false;
        const serviceSwitch = accessory.getService(_hap.Service.Switch);
        if (serviceSwitch !== undefined) {
            const charOn = serviceSwitch.getCharacteristic(_hap.Characteristic.On);
            if (charOn !== undefined) {
                result = charOn.value;
            }
            else {
                throw new Error(`The Switch service of accessory ${accessory.displayName} does not have an On charactristic.`);
            }
        }
        else {
            throw new Error(`Accessory ${accessory.displayName} does not have a Switch service.`);
        }

        return result;
    }
}

exports.default = main;
