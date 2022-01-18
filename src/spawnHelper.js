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

// External dependencies and imports.
import EventEmitter from 'events';
import _debugModule from 'debug';
import _childProcessModule from 'child_process';

/**
 * @description Function pointer for spawn function.
 * @private
 */
const _spawn = _childProcessModule.spawn;
/**
 * @description Debugging function pointer for runtime related diagnostics.
 * @private
 */
const _debug = new _debugModule('spawn_helper');

// Bind debug to console.log
// eslint-disable-next-line no-console
_debug.log = console.log.bind(console);

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
export class SpawnHelper extends EventEmitter {
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
        _debug(`Child Process for ${this.Command}: '${message}'`);
    }

    /**
     * @description Event handler for the Child Process Error Notification
     * @param {Error} error - The error
     * @returns {void}
     * @private
     */
    _process_error(error) {
        // Log the error info.
        _debug(`Child Process for ${this.Command}: error_num:${error.number} error_name:${error.name} error_msg:${error.message}`);

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
        _debug(`Child Process for ${this.Command}: exit_code:${code} by signal:'${signal}'`);

        // Indicate that we are done.
        this._pending = false;

        // Notify our clients.
        const isValid = this.IsValid;
        // eslint-disable-next-line object-curly-newline
        const response = {valid: isValid, result: (isValid ? this.Result : this.Error), token: this.Token, source: this};
        this.emit('complete', response);
    }
}
export default SpawnHelper;
