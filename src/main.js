/* ==========================================================================
   File:               main.js
   Description:	       Homebridge integration for Volume Monitor
   Copyright:          Jan 2021
   ========================================================================== */
'use strict';

// External dependencies and imports.
const _debug = require('debug')('homebridge');
// eslint-disable-next-line no-unused-vars
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
import { VolumeInterrogator_darwin as _VolInterrogatorDarwin } from './volumeInterrogator_darwin.js';
import { VolumeData } from './volumeData';

// Configuration constants.
const PLUGIN_NAME   = CONFIG_INFO.plugin;
const PLATFORM_NAME = CONFIG_INFO.platform;

// Internal Constants
// History:
// unspecified: Initial Release
//          v2: Purge Offline and better UUID management.
const ACCESSORY_VERSION = 2;

const FIXED_ACCESSORY_SERVICE_TYPES = {
    Switch : 0
};

// Listing of fixed (dedicated) accessories.
const FIXED_ACCESSORY_INFO = {
    CONTROLS  : {uuid:`2CF5A6C7-8041-4805-8582-821B19589D60`, model:`Control Switches`, serial_num:`00000001`, service_list: { MANUAL_REFRESH:{type:FIXED_ACCESSORY_SERVICE_TYPES.Switch, name:`Refresh`, uuid:`23CB97AC-6F0C-46B5-ACF6-78025632A11F`, udst:`ManualRefresh`},
                                                                                                                               PURGE_OFFLINE: {type:FIXED_ACCESSORY_SERVICE_TYPES.Switch, name:`Purge`,   uuid:`FEE232D5-8E25-4C1A-89AC-5476B778ADEF`, udst:`PurgeOffline` } }
                }
};

// Host Operating System
const HOST_OPERATING_SYSTEM = process.platform;
// Supported operating systems.
const SUPPORTED_OPERATING_SYSTEMS = {
    OS_DARWIN: 'darwin',
};

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
    if (!Object.prototype.hasOwnProperty.call(_PlatformAccessory, 'PlatformAccessoryEvent')) {
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

        let theSettings = undefined;
        let viConfig = {};
        if (Object.prototype.hasOwnProperty.call(this._config, 'settings')) {
            // Get the system configuration,
            theSettings = this._config.settings;
        }
        if (theSettings != undefined) {
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
                    for (const mask of theSettings.exclusion_masks) {
                        exclusionMasksValid &= (typeof(mask) === 'string');
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
                    this._volumeInterrogator = new _VolInterrogatorDarwin(viConfig);
                }
                break;

                default: {
                    // Unsupported OS
                    this._volumeInterrogator = undefined;
                    this._log(`Operating system not supported. os:${HOST_OPERATING_SYSTEM}`);
                }
            }
        }
        catch (error) {
            this._volumeInterrogator = undefined;
            this._log(`Unable to create the VolumeInterrogator. err:'${error.message}`);
        }

        /* Bind Handlers */
        this._bindDoInitialization          = this._doInitialization.bind(this);
        this._bindDestructorNormal          = this._destructor.bind(this, {cleanup:true});
        this._bindDestructorAbnormal        = this._destructor.bind(this, {exit:true});
        this._CB_VolumeIterrrogatorScanning = this._handleVolumeInterrogatorScanning.bind(this);
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
        if (this._volumeInterrogator !== undefined) {
            this._volumeInterrogator.on('scanning', this._CB_VolumeIterrrogatorScanning);
            this._volumeInterrogator.on('ready',    this._CB_VolumeIterrrogatorReady);
        }
    }

 /* ========================================================================
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
                this._log.debug(`Terminating the volume interrogator.`);
                this._volumeInterrogator.removeListener('scanning', this._CB_VolumeIterrrogatorScanning);
                this._volumeInterrogator.removeListener('ready',    this._CB_VolumeIterrrogatorReady);
                await this._volumeInterrogator.Terminate();
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

        // Abort if there is no interrogator
        if (this._volumeInterrogator === undefined) {
            this._log(`Volume Interrogator not set.`);
            return;
        }

        let theSettings = undefined;
        if (Object.prototype.hasOwnProperty.call(this._config, 'settings')) {
            // Get the system configuration,
            theSettings = this._config.settings;
        }

        // Check for Settings
        if (theSettings != undefined) {
            // Polling Interval {Hours}
            if ((Object.prototype.hasOwnProperty.call(theSettings, 'polling_interval')) &&
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
        accessoriesToRemove.forEach(accessory => {
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
            accessoryControls.context.SETTINGS = {SwitchStates:[ {id:FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.uuid, state:true },
                  {id:FIXED_ACCESSORY_INFO.CONTROLS.service_list.PURGE_OFFLINE.uuid,  state:false } ]};

            // Create & Configure the control services.
            for (const service_item of Object.values(FIXED_ACCESSORY_INFO.CONTROLS.service_list)) {
                const serviceType = this._getAccessoryServiceType(service_item.type);
                const service = accessoryControls.addService(serviceType, service_item.uuid, service_item.udst);
                if (service !== undefined) {
                    service.updateCharacteristic(_hap.Characteristic.Name, `${service_item.name}`);
                }
            }

            // Update the accessory information.
            this._updateAccessoryInfo(accessoryControls, {model:FIXED_ACCESSORY_INFO.CONTROLS.model, serialnum:FIXED_ACCESSORY_INFO.CONTROLS.serial_num});

            // configure this accessory.
            this._configureAccessory(accessoryControls);

            // register the manual refresh switch
            this._api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessoryControls]);
        }

        // Start interrogation.
        this._volumeInterrogator.Start();
    }

 /* ========================================================================
    Description: Homebridge API invoked after restoring cached accessorues from disk.

    @param {PlatformAccessory} [accessory] - Accessory to be configured.

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory
    ======================================================================== */
    configureAccessory(accessory) {
        // Validate the argument(s)
        if ((accessory === undefined) ||
            (!(accessory instanceof _PlatformAccessory))) {
            throw new TypeError(`accessory must be a PlatformAccessory`);
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
            try
            {
                this._configureAccessory(accessory);
            }
            catch (error)
            {
                this._log(`Unable to configure accessory ${accessory.displayName}. Version:${accessory.context.VERSION}. Error:${error}`);
                this._accessories.set(accessory.displayName, accessory);
            }
        }
    }

 /* ========================================================================
    Description: Event handler for the Volume Interrogator 'scanning' event.
    ======================================================================== */
    _handleVolumeInterrogatorScanning() {
        // Decouple from the event.
        setImmediate(() => {
            this._log.debug(`Scanning initiated.`);
            // If a scanning event has been initiated, Ensure that the the Refresh switch is On.
            const accessoryControls = this._accessories.get(FIXED_ACCESSORY_INFO.CONTROLS.model);
            if (accessoryControls !== undefined) {
                const serviceRefreshSwitch = accessoryControls.getService(FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.udst);
                if (serviceRefreshSwitch !== undefined) {
                    if (!this._getAccessorySwitchState(serviceRefreshSwitch)) {
                        this._log.debug(`Setting Refresh switch On.`);
                        serviceRefreshSwitch.updateCharacteristic(_hap.Characteristic.On, true);
                    }
                    else {
                        this._log.debug(`Refresh switch is already On.`);
                    }
                }
                else {
                    this._log.debug(`Unable to find Manual Refresh service.`);
                }
            }
            else {
                this._log.debug(`Unable to find CONTROLS accessory`);
            }
        });
    }

 /* ========================================================================
    Description: Event handler for the Volume Interrogator 'ready' event.

    @param {object} [theData] - object containing a 'results' item which is an array of volume data results.

    @throws {TypeError} - Thrown when 'results' is not an Array of VolumeData objects.
    ======================================================================== */
    _handleVolumeInterrogatorReady(theData) {
        // Decouple from the event.
        setImmediate((data) => {
            // Validate the parameters.
            if ((data === undefined) ||
                (!Object.prototype.hasOwnProperty.call(data, 'results'))) {
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

            // Update the volumes data.
            for (const result of data.results) {
                if (result.IsMounted) {
                    this._log.debug(`\tName:${result.Name.padEnd(20, ' ')}\tVisible:${result.IsVisible}\tShown:${result.IsShown}\tSize:${VolumeData.ConvertFromBytesToGB(result.Size).toFixed(4)} GB\tUsed:${((result.UsedSpace/result.Size)*100.0).toFixed(2)}%\tMnt:${result.MountPoint}`);
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
                catch(error) {
                    this._log.debug(`Error when managing accessory: ${volData.Name}`);
                }
            }

            const accessoryControls = this._accessories.get(FIXED_ACCESSORY_INFO.CONTROLS.model);
            if (accessoryControls !== undefined) {
                // Cleanup (if purge is enabled)
                const servicePurge = accessoryControls.getServiceById(FIXED_ACCESSORY_INFO.CONTROLS.service_list.PURGE_OFFLINE.uuid, FIXED_ACCESSORY_INFO.CONTROLS.service_list.PURGE_OFFLINE.udst);
                if (servicePurge !== undefined) {
                    const purgeState = this._getAccessorySwitchState(servicePurge);
                    if (purgeState) {
                        let purgeList = [];
                        // Check for Volumes that are no longer Visible or did not have any results reported.
                        for (const volData of this._volumesData.values()) {
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
                        purgeList.forEach(accessory => {
                            this._volumesData.delete(accessory.displayName);
                            this._removeAccessory(accessory);
                        });
                    }
                }
                // Get the Manual Refresh service.
                const serviceManlRefresh = accessoryControls.getServiceById(FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.uuid, FIXED_ACCESSORY_INFO.CONTROLS.service_list.MANUAL_REFRESH.udst);
                if ((serviceManlRefresh !== undefined) &&
                    (this._getAccessorySwitchState(serviceManlRefresh))) {
                    // Ensure the switch is turned back off.
                    serviceManlRefresh.updateCharacteristic(_hap.Characteristic.On, false);
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
        }, theData);
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

        // Mark the version of the accessory. This is used for depersistence
        accessory.context.VERSION = ACCESSORY_VERSION;

        try {
            // Configura the accessory
            this._configureAccessory(accessory);
        }
        catch (error) {
            this._log.debug(`Error when configuring accessory.`);
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

        let theSwitchStates = undefined;
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
                charOn.on('get', this._handleOnGet.bind(this, {accessory:accessory, service_id:id}));
                // Register for the "set" event notification.
                charOn.on('set', this._handleOnSet.bind(this, {accessory:accessory, service_id:id}));
            }
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
        // Iterate through all the services on the accessory
        for (const service of accessory.services) {
            // Is this service a Switch?
            if (service instanceof _hap.Service.Switch) {
                // Get the On characteristic.
                const charOn = service.getCharacteristic(_hap.Characteristic.On);
                // Build the identification id
                const id = `${service.displayName}.${service.subtype}`;
                // Register for the "get" event notification.
                charOn.off('get', this._handleOnGet.bind(this, {accessory:accessory, service_id:id}));
                // Register for the "get" event notification.
                charOn.off('set', this._handleOnSet.bind(this, {accessory:accessory, service_id:id}));
            }
        }

        /* Unregister the accessory */
        this._api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        /* remove the accessory from our mapping */
        this._accessories.delete(accessory.displayName);
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
            (!Object.prototype.hasOwnProperty.call(info, 'model'))     || ((typeof(info.model)      !== 'string') || (info.model instanceof Error)) ||
            (!Object.prototype.hasOwnProperty.call(info, 'serialnum')) || ((typeof(info.serialnum)  !== 'string') || (info.serialnum instanceof Error)) ) {
            throw new TypeError(`info must be an object with properties named 'model' and 'serialnum' that are either strings or Error`);
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

    @param {object} [event_info] - accessory and id of the switch service being querried.
    @param {object} [event_info.accessory] - Platform Accessory
    @param {string} [event_info.service_id]- UUID of the Switch service being qeurried.

    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'event_info' is not an object.
    @throws {TypeError} - Thrown when 'event_info.accessory' is not an instance of _PlatformAccessory.
    @throws {TypeError} - Thrown when 'event_info.service_id' is not a valid string.
    @throws {RangeError} - Thrown when 'event_info.service_id' does not belong to 'event_info.accessory'
    @throws {TypeError} - Thrown when 'event_info.service_id' does not correspond to a Switch service.
    ======================================================================== */
    _handleOnGet(event_info, callback) {
        // Validate arguments
        if ((event_info === undefined) || (typeof(event_info) !== 'object') ||
            (!Object.prototype.hasOwnProperty.call(event_info, 'accessory')) ||
            (!Object.prototype.hasOwnProperty.call(event_info, 'service_id')))  {
            throw new TypeError(`event_info must be an object with an 'accessory' and 'service_id' field.`);
        }
        if ((event_info.accessory === undefined) || !(event_info.accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`'event_info.accessory' must be a PlatformAccessory`);
        }
        if ((event_info.service_id === undefined) || (typeof(event_info.service_id) !== 'string') ||
            (event_info.service_id.length <= 0)) {
            throw new TypeError(`event_info.service_id' must be non-null string.`);
        }
        const id = event_info.service_id.split(`.`);
        if (!Array.isArray(id) || (id.length !== 2)) {
            throw new TypeError(`'event_info.service_id' does not appear to be valid. '${event_info.service_id}'`);
        }

        const theService = event_info.accessory.getServiceById(id[0], id[1]);
        // Ensure that the Service Id belongs to the Accessory
        if (theService === undefined) {
            throw new RangeError(`'event_info.service_id' does not belong to event_info.accessory.`);
        }
        // Ensure that the Service Id belongs to the Accessory
        if (!(theService instanceof _hap.Service.Switch)) {
            throw new TypeError(`'event_info.service_id' must correspond to a switch service.`);
        }

        this._log.debug(`Switch '${event_info.accessory.displayName}-${theService.displayName}.${theService.subtype}' Get Request.`);

        let status = null;
        let result = undefined;
        try {
            result = this._getAccessorySwitchState(theService);
        }
        catch (err) {
            this._log.debug(`  Unexpected error encountered: ${err.message}`);
            result = false;
            status = new Error(`Accessory ${event_info.accessory.displayName} is not ressponding.`);
        }

        // Invoke the callback function with our result.
        callback(status, result);
    }

 /* ========================================================================
    Description: Event handler for the "set" event for the Switch.On characteristic.

    @param {object} [event_info] - accessory and id of the switch service being set.
    @param {object} [event_info.accessory] - Platform Accessory
    @param {string} [event_info.service_id]- UUID of the Switch service being set.
    @param {bool} [value]        - new/rewuested state of the switch
    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'event_info' is not an object.
    @throws {TypeError} - Thrown when 'event_info.accessory' is not an instance of _PlatformAccessory.
    @throws {TypeError} - Thrown when 'event_info.service_id' is not a valid string.
    @throws {RangeError} - Thrown when 'event_info.service_id' does not belong to 'event_info.accessory'
    @throws {TypeError} - Thrown when 'event_info.service_id' does not correspond to a Switch service.
    ======================================================================== */
    _handleOnSet(event_info, value, callback) {
        // Validate arguments
        if ((event_info === undefined) || (typeof(event_info) !== 'object') ||
            (!Object.prototype.hasOwnProperty.call(event_info, 'accessory')) ||
            (!Object.prototype.hasOwnProperty.call(event_info, 'service_id')))  {
            throw new TypeError(`event_info must be an object with an 'accessory' and 'service_id' field.`);
        }
        if ((event_info.accessory === undefined) || !(event_info.accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`'event_info.accessory' must be a PlatformAccessory`);
        }
        if ((event_info.service_id === undefined) || (typeof(event_info.service_id) !== 'string') ||
            (event_info.service_id.length <= 0)) {
            throw new TypeError(`'event_info.service_id' must be non-null string.`);
        }
        const id = event_info.service_id.split(`.`);
        if (!Array.isArray(id) || (id.length !== 2)) {
            throw new TypeError(`'event_info.service_id' does not appear to be valid. '${event_info.service_id}'`);
        }

        const theService = event_info.accessory.getServiceById(id[0], id[1]);
        // Ensure that the Service Id belongs to the Accessory
        if (theService === undefined) {
            throw new RangeError(`'event_info.service_id' does not belong to event_info.accessory.`);
        }
        // Ensure that the Service Id belongs to the Accessory
        if (!(theService instanceof _hap.Service.Switch)) {
            throw new TypeError(`'event_info.service_id' must correspond to a switch service.`);
        }

        this._log.debug(`Switch '${event_info.accessory.displayName}-${theService.displayName}.${theService.subtype}' Set Request. New state:${value}`);

        let theSwitchState = undefined;
        const theSettings = event_info.accessory.context.SETTINGS;
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
                if ((!value) && (currentValue))
                {
                    // Attempting to turn the switch from on to off.
                    // Not permitted.
                    this._log.debug(`Unable to turn the '${event_info.accessory.displayName}' switch off.`);
                    status = new Error(`Unable to turn the '${event_info.accessory.displayName}' switch off.`);

                    // Decouple setting the switch back on.
                    setImmediate((evtInfo, resetVal) => {
                        if (theService !== undefined) {
                            this._log.debug(`Switch '${theService.displayName}' Restoring state ${resetVal}`);
                            theService.updateCharacteristic(_hap.Characteristic.On, resetVal);
                        }
                     }, event_info, currentValue);

                     finalValue = currentValue;
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

            status = new Error(`Accessory ${event_info.accessory.displayName} is not ressponding.`);
        }

        // Persist the value set.
        if (theSwitchState !== undefined) {
            theSwitchState.state = finalValue;
        }

        callback(status);
    }

 /* ========================================================================
    Description: Get the value of the Service.Switch.On characteristic value

    @param {object} [switchService] - Switch Service

    @return - the value of the On characteristic (true or false)

    @throws {TypeError} - Thrown when 'switchService' is not an instance of a Switch Service.
    @throws {TypeError} - Thrown when 'event_info.accessory' is not an instance of _PlatformAccessory.
    @throws {TypeError} - Thrown when 'event_info.service_id' is not a valid string.
    @throws {RangeError} - Thrown when 'event_info.service_id' does not belong to 'event_info.accessory'
    @throws {TypeError} - Thrown when 'event_info.service_id' does not correspond to a Switch service.
    @throws {Error}     - Thrown when the On characteristic cannot be found on the service.
    ======================================================================== */
    _getAccessorySwitchState(switchService) {
        // Validate arguments
        if ((switchService === undefined) || !(switchService instanceof _hap.Service.Switch)) {
            throw new TypeError(`'switchService' must be a _hap.Service.Switch`);
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

 /* ========================================================================
    Description: Helper to specify the HAP Service Type from the FIXED_ACCESSORY_SERICE_TYPES enumeration.

    @param {enum:FIXED_ACCESSORY_SERVICE_TYPES} [service_type] - Type of the service to get.

    @return - the HAP Service type.

    @throws {TypeError} - Thrown if 'service_type' is not a FIXED_ACCESSORY_SERVICE_TYPES value.
    ======================================================================== */
    _getAccessoryServiceType(service_type) {
        // Validate arguments
        if ((service_type === undefined) || (typeof(service_type) !== 'number') ||
            (Object.values(FIXED_ACCESSORY_SERVICE_TYPES).indexOf(service_type) < 0)) {
            throw new TypeError(`service_type not a member of FIXED_ACCESSORY_SERVICE_TYPES. ${service_type}`);
        }

        let rtnVal = undefined;

        switch (service_type) {
            case FIXED_ACCESSORY_SERVICE_TYPES.Switch:
            {
                rtnVal = _hap.Service.Switch;
            }
            break;

            default:
            {
                // Not handled. Should never happen !!
                throw new Error(`This cannot happen !! service_type=${service_type}`);
            }
            // eslint-disable-next-line no-unreachable
            break;

        }

        return rtnVal;
    }
}