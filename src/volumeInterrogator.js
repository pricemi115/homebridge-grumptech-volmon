/* ==========================================================================
   File:               volumeInterrogator.js
   Class:              Volume Interrogator
   Description:	       Interrogates the system to determine properties and 
                       attribures of interest for volumes.
   Copyright:          Dec 2020
   ========================================================================== */
'use strict';

// External dependencies and imports.
const _plist = require('plist');

// Internal dependencies.
import { SpawnHelper } from './spawnHelper.js';

// Helpful constants and conversion factors.
const DEFAULT_PERIOD_HR     = 6.0;
const MIN_PERIOD_HR         = (5.0 / 60.0);     // Once every 5 minutes.
const MAX_PERIOD_HR         = (31.0 * 24.0);    // Once per month.
const CONVERT_HR_TO_MS      = (60.0 * 60.0 * 1000.0);
const INVALID_TIMEOUT_ID    = -1;
const BYTES_TO_GB           = (1024.0 * 1024.0 * 1024.0);
const BLOCK_TO_1KB          = 1024.0;

/* ==========================================================================
   Class:              VolumeInterrogator
   Description:	       Manager for interrogating volumes on the system
   Copyright:          Dec 2020

   @event 'ready' => function({object})
   @event_param {bool}     [valid]  - Flag indicating if the spawned task completed successfully.
   @event_param {<Buffer>} [result] - Buffer of the data or error returned by the spawned process.
   Event emmitted when the (periodic) interrogation is completes.
   ========================================================================== */
export class VolumeInterrogator {
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
        
        // Initialize data members.
        this._timeoutID = INVALID_TIMEOUT_ID;
        this._checkInProgress = false;
        this._period_hr = DEFAULT_PERIOD_HR;

        // Callbacks bound to this object.
        this._CB__initiateCheck                 = this._initiateCheck.bind(this);
        this._CB_process_diskUtil_list_complete = this._process_diskutil_list_complete.bind(this);

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
     @throws {RangeError} - thrown if 'period_hr' outsode the allowed bounds. 
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
        
        // Perform a check now.
        this._initiateCheck();
    }

  /* ========================================================================
     Description: Helper function used to initiate an interrogation of the 
                  system volumes.

     @remarks: Called periodically by a timeout timer.
    ======================================================================== */
    _initiateCheck() {
        if (!this._checkInProgress) {
            // Mark that the check is in progress.
            this._checkInProgress = true;

            // Spawn a 'diskutil list' to see all the disk/volume data
            const diskutil_list = new SpawnHelper();
            diskutil_list.on('complete', this._CB_process_diskUtil_list_complete);
            diskutil_list.Spawn({ command:'diskutil', arguments:['list', '-plist'] });
        }

        // Compute the number of milliseconds for the timeout
        const theDelay = this._period_hr * CONVERT_HR_TO_MS;
        // Queue another check 
        this._timeoutID = setTimeout(this._CB__initiateCheck, theDelay);
    }

  /* ========================================================================
     Description:    Event handler for the SpawnHelper 'complete' Notification

     @param { <object> }                    [response]        - A parsed JSON object or primitive value.
     @param { bool }                        [response.valid]  - Flag indicating if the spoawned process
                                                                was completed successfully.
     @param { <Buffer> | <string> | <any> } [response.result] - Result or Error data provided  by 
                                                                the spawned process.
    ======================================================================== */
    _process_diskutil_list_complete(response) {
        console.log(`Spawn Helper Result: valid:${response.valid}`);
        console.log(response.result);

        if (response.valid) {
            console.log("config");
            const config = _plist.parse(response.result.toString());
            console.log(JSON.stringify(config));   
        }

        this._checkInProgress = false;
    }
}
