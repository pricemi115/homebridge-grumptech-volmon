/* ==========================================================================
   File:               main.js
   Description:	       Homebridge integration for Volume Monitor
   Copyright:          Jan 2021
   ========================================================================== */
'use strict';

const _debug = require('debug')('homebridge-controller');
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
                _debug(`Terminating the volume interrogator.`);
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
        this._removeAccessories();

        // Start interrogation.
        this._volumeInterrogator.Start();
    }

 /* ========================================================================
    Description: Homebridge API invoked after restoring cached accessorues from disk.

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory
    ======================================================================== */
    configureAccessory(accessory) {

        // This application has no need for history.
        // If an accessory is restored, then destroy it, but do so asynchronously
        setImmediate(() => {
            this._api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        });
    }

 /* ========================================================================
    Description: Helper to retrieve the specified characteristic.

    @param {object} [accessoryKey]              - Key used to identify the accessory of interest. (Assumed to match the Accessory.context.key)
    @param {object} [serviceTemplate]           - Template of the service being sought.
    @param {object} [characteristicTemplate]    - Template of the characteristic being sought.

    @return {object}  - Characteristic if match found. Otherwise undefined.
    ======================================================================== */
    _findCharacteristic(accessoryKey, serviceTemplate, characteristicTemplate) {
        let matchedCharacteristic = undefined;

        // Get a iterable list of Accessories
        const iterAccessories = this._accessories.values();
        for (let accessory of iterAccessories) {
            if ((accessory.context.hasOwnProperty('key')) &&
                (accessoryKey === accessory.context.key)) {
                const service = accessory.getService(serviceTemplate);
                // Is this a matching service?
                if (service != undefined) {
                    // Is there a matching characteristic?
                    if (service.testCharacteristic(characteristicTemplate)) {
                        // Match found.
                        matchedCharacteristic = service.getCharacteristic(characteristicTemplate);
                        break;
                    }
                }
            }
        }

        return matchedCharacteristic;
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
                _debug(`\tName:${result.Name.padEnd(20, ' ')}\tVisible:${result.IsVisible}\tSize:${VolumeData.ConvertFromBytesToGB(result.Size).toFixed(4)} GB\tUsed:${((result.UsedSpace/result.Size)*100.0).toFixed(2)}%\tMnt:${result.MountPoint}`);
            }

            // Update the map of volume data.
            this._volumesData.set(result.Name, result);
        }

        // Loop through the visible volumes and publish/update them.
        for (const volData of this._volumesData.values()) {
            if (volData.IsVisible) {
                try {
                    // Is this volume known to us?
                    if (this._accessories.has(volData.Name)) {
                        // Exists. So update it
                        this._updateAccessory(this._accessories.get(volData.Name));
                    }
                    else {
                        // Does not exist. Add it
                        this._addAccessory(volData.Name);
                    }
                }
                catch(error) {
                    _debug(`Error when managing accessory: ${volData.Name}`);
                    console.log(error);
                }
            }
        }

        // Scan for any accessories that are no longer valid and purge them.
        let purgeList = [];
        for (const accessory of this._accessories.values()) {
             // If this accessory is completely unknonw purge it.
            let purge = (!this._volumesData.has(accessory.displayName));

            // If the volume for this accessory is present, ensure it is visible.
            if (!purge) {
                const volData = this._volumesData.get(accessory.displayName);
                purge = (!volData.IsVisible);
            }

            // Purge when needed.
            if (purge) {
                // Add this accessory to the purge list.
                purgeList.push(accessory);
            }
        }
        // Purge the accessories that were identified for removal.
        for (const accessory of purgeList) {
             try {
                this._removeAccessory(accessory);
            }
            catch (error) {
                _debug(`Error when purging accessory: ${volData.Name}`);
                console.log(error);
            }
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
    _addAccessory(name) {

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

        this._log(`Adding new accessory: name:'${name}'`);

        // uuid must be generated from a unique but not changing data source, theName should not be used in the most cases. But works in this specific example.
        const uuid = _hap.uuid.generate(name);
        const accessory = new _PlatformAccessory(name, uuid);

        // Create our services.
        accessory.addService(_hap.Service.BatteryService, name);

        // Update our accessory listing
        this._accessories.set(name, accessory);

        try {
            // Configura the accessory
            this._configureAccessory(accessory);

            // Update the accessory
            this._updateAccessory(accessory);
        }
        catch (error) {
            _debug(`Error when configuring accessory.`);
            console.log(error);
        }

        this._api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

 /* ========================================================================
    Description: Internal function to perform accessory configuration.

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory

    @remarks:     Opportunity to setup event handlers for characteristics and update values (as needed).
    ======================================================================== */
    _configureAccessory(accessory) {

        if ((accessory === undefined) ||
            (!(accessory instanceof _PlatformAccessory))) {
            throw new TypeError(`accessory must be a PlatformAccessory`);
        }

        this._log("Configuring accessory %s", accessory.displayName);

        // Register to handle the Identify request for the accessory.
        // TO DO - probably does not work !!

        accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
            console.log("Identify !!");
            this._log("%s identified!", accessory.displayName);
        });

        // Is this accessory new to us?
        if (!this._accessories.has(accessory)){
            // Update our accessory listing
            _debug(`Adding accessory '${accessory.displayName} to the accessories list. Count:${this._accessories.size}`);
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

        this._log.info(`Removing accessory '${accessory.displayName}'`);

        /* Unregister the accessory */
        this._api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        /* remove the accessory from our mapping */
        this._accessories.delete(accessory.displayName);
    }

 /* ========================================================================
    Description: Removes all of the platform accessories.
    ======================================================================== */
    _removeAccessories() {

        this._log(`Removing Accessories.`);

        // Make a list of accessories to be deleted.
        let purgeList = [];
        for (const accessory of this._accessories.values()) {
            purgeList.push(accessory);
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
    _updateAccessory(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }

        this._log(`Updating accessory '${accessory.displayName}'`);

        let reachable = false;
        let percentFree = 100.0;
        let lowAlert = false;
        let theModel = 'unknown';
        let theSerialNumber = `00000000000000000`;

        // Is the volume associated with this directory known?
        if (this._volumesData.has(accessory.displayName)) {

            // Get the volume data.
            const volData = this._volumesData.get(accessory.displayName);

            if (volData.IsVisible) {

                 // Compute the fraction of space remaining.
                percentFree = ((volData.FreeSpace/volData.Size)*100.0).toFixed(0);
                // Determine if the remaining space threshold has been exceeded.
                lowAlert = (percentFree < this._alarmThreshold);

                // Accessory is reachable
                reachable = true;
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
            const batteryChargingState = batteryService.getCharacteristic(_hap.Characteristic.ChargingState);
            if (batteryChargingState !== undefined) {
                batteryChargingState.updateValue(_hap.Characteristic.ChargingState.NOT_CHARGEABLE);
            }
            /* Battery Level Characteristic */
            const batteryLevel = batteryService.getCharacteristic(_hap.Characteristic.BatteryLevel);
            // Update the battery Level
            if (batteryLevel !== undefined) {
                batteryLevel.updateValue(percentFree);
            }
            /* Low Battery Status (Used to indicate a nearly full volume) */
            const lowBatteryStatus = batteryService.getCharacteristic(_hap.Characteristic.StatusLowBattery);
            if (lowBatteryStatus !== undefined) {
                lowBatteryStatus.updateValue(lowAlert);
            }
        }
        /* Get the accessory info service. */
        const accessoryInfoService = accessory.getService(_hap.Service.AccessoryInformation);
        if (accessoryInfoService != undefined)
        {
            /* Manufacturer */
            const manufacturer = accessoryInfoService.getCharacteristic(_hap.Characteristic.Manufacturer);
            if (manufacturer != undefined) {
                manufacturer.updateValue(`GrumpTech`);
            }
            /* Model */
            const model = accessoryInfoService.getCharacteristic(_hap.Characteristic.Model);
            if (model != undefined) {
                model.updateValue(theModel);
            }
            /* Serial Number */
            const serialNumber = accessoryInfoService.getCharacteristic(_hap.Characteristic.SerialNumber);
            if (serialNumber != undefined) {
                 serialNumber.updateValue(theSerialNumber);
            }
        }
    }
}
