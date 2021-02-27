/* ==========================================================================
   File:               main.js
   Description:	       Homebridge integration for Volume Monitor
   Copyright:          Jan 2021
   ========================================================================== */
'use strict';

const _debug = require('debug')('homebridge');
import { version as PLUGIN_VER }      from '../package.json';
import { config_info as CONFIG_INFO } from '../package.json';

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The import block below may seem like we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the import statement below MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * and used to access all exported variables and classes from HAP-NodeJS.
 */
/*
import {
    API,
    APIEvent,
    CharacteristicEventTypes,
    CharacteristicSetCallback,
    CharacteristicValue,
    DynamicPlatformPlugin,
    HAP,
    Logging,
    PlatformAccessory,
    PlatformAccessoryEvent,
    PlatformConfig,
  } from "homebridge";
*/

// Internal dependencies
import { VolumeInterrogator as _VolumeInterrogator } from './volumeInterrogator.js';
import { VolumeData } from './volumeData';

// Configuration constants.
const PLUGIN_NAME   = CONFIG_INFO.plugin;
const PLATFORM_NAME = CONFIG_INFO.platform;

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
export default (homebridgeAPI) => {
    _debug(`homebridge API version: v${homebridgeAPI.version}`);

    // Accessory must be created from PlatformAccessory Constructor
    _PlatformAccessory  = homebridgeAPI.platformAccessory;
    if (!_PlatformAccessory.hasOwnProperty('PlatformAccessoryEvent')) {
        // Append the PlatformAccessoryEvent.IDENTITY enum to the platform accessory reference.
        // This allows us to not need to import anything from 'homebridge'.
        const platformAccessoryEvent = {
            IDENTIFY: "identify",
        }

        _PlatformAccessory.PlatformAccessoryEvent = platformAccessoryEvent;
    }

    // Cache the reference to hap-nodejs
    _hap                = homebridgeAPI.hap;

    // Register the paltform.
    _debug(`Registering platform: ${PLATFORM_NAME}`);
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
        this._volumeInterrogator = new _VolumeInterrogator();

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
        // Lastly eliminate myself.
        delete this;
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
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Manufacturer, `GrumpTech`)

            /* Model */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Model, info.model)

            /* Serial Number */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.SerialNumber, info.serialnum)
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
