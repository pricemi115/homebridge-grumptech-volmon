# Homebridge Volume Monitor

[Homebridge Volume Monitor](https://github.com/pricemi115/homebridge-grumptech-volmon), by [GrumpTech](https://github.com/pricemi115/), is a [Homebridge](https://homebridge.io) dynamic platform plug-in that publishes the remaining storage of mounted volumes on macOS/OSX operating systems to Homekit. The remaining storage, computed as a percentage of the total, is presented as a _Battery Service_ accessory. A _low battery alert_ will be issued when the remaining storage falls below a specified threshold.

## Change Log
The change history can be viewed [here](./CHANGELOG.md)

## Security Policy
Please refer to our [security policy](./SECURITY.md) for information on which versions are receiving security updates and how to report security vulnerabilities.

## Installation
This plug-in is intended to be used with the [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x) homebridge management tool. If using _homebridge-config-ui-x_, simply search for _homebridge-grumptech-volmon_ for installation, plug-in management, and configuration.

To install the plugin manually:
<br>_`npm install -g homebridge-grumptech-volmon`_

## Configuration
### _homebridge-config-ui-x_
This plugin is best experienced when running as a module installed and managed by the [_homebridge-config-ui-x_](https://www.npmjs.com/package/homebridge-config-ui-x) plugin. When running under homebridge-config-ui-x, visiting the plugin settings will allow you to change the polling interval,  the default low space alarm threshold, as well as per-volume exceptions/customizations. The per-volume customizations also allow for the low space alarm to be diaabled. This is useful, for example, when the volume is read-only, or not important enough to warrant having an alarm.<br/>
<img src="./assets/config-ui-x_settings.png"
     alt="Configuration Settings UI"
     style="padding:2px 2px 2px 2px; border:2px solid; margin:0px 10px 0px 0px; vertical-align:top;"
     width="20%">
<img src="./assets/config-ui-x_configjson.png"
     alt="Configuration Settings JSON"
     style="padding:2px 2px 2px 2px; border:2px solid; margin:0px 10px 0px 0px; vertical-align:top;"
     width="31.5%">

| Setting | Description | Field Name | Parameter Type | Data Type | Units | Default | Minimum or Allowed Values | Maximum | Comments |
| :------: | :------: | :------: | :------: | :------: |:------: | :------: | :------: | :------: | :------: |
| Polling Interval | The time between automatic scans of the system | polling_interval | Common | Number | Hours | 1 | 0.083334 | 744 | |
| Low Space Alarm Threshold (Default) | Percent of remaining space that will trigger a _low battery_ alert (default) | alarm_threshold | Common | Number | Percent | 15 | 1 | 99 | |
| Exclusion List | An array of regular expression patterns indicating the volumes to be excluded based on the volume mount point. | exclusion_masks | Common | Array of Strings | N/A | `^/Volumes/\\.timemachine/.*` and `^/System/Volumes/.*` | | | By default, time machine and system volumes are excluded. Emulates previous behavior. |
| Enable Volume Customizations | Allow customixations for speficic volumes | enable_volume_customizations | Common | Boolean | N/A | Off | Off | On | |
| Volume Identification Method | Method for identifying the volume | volume_customizations:items:volume_id_method | Per-Customization | String | N/A | name | name, serial_num | | |
| Volume Name | Name of the volume | volume_customizations:items:volume_name | Per-Customization | String | N/A | | | | Required if the volume method is 'name' |
| Volume Serial Number | Serial number of the volume | volume_customizations:items:volume_serial_num | Per-Customization | String | N/A | | | | Required if the volume method is 'serial_num'. Serial number is shown in the HomeKit device information section. |
| Low Space Alarm | Enable the low space alarm | volume_customizations:items:volume_low_space_alarm_active | Per-Customization | Boolean | N/A | On | Off | On | Takes prescedence over the default threshold. |
| Low Space Alarm Threshold | Percent of remaining space that will trigger a _low battery_ alert | volume_customizations:items:volume_alarm_threshold | Per-Customization | Number | Percent | 15 | 1 | 99 | Takes prescedence over the default threshold. Required if the 'Low Space Alarm' is enabled for this customization. |
<br/>

Additionally, especially if this system will be running other homebridge modules, it is strongly encouraged to run this plugin as an isolated child bridge. This setting page can be found by clicking on the _wrench_ icon on the plugin and then selecting _Bridge Settings_. With the child bridge enabled, revisiting the setting page after homebridge is rebooted will show a QR code for pairing to the child bridge. The username (mac address) and port are randomly generaged by homebridge-config-ui-x.<br/>
<img src="./assets/config-ui-x_bridgesettings_disabled.png"
     alt="Bridge Settings Disabled Postreboot"
     style="padding:2px 2px 2px 2px; border:2px solid; margin:0px 10px 0px 0px; vertical-align:top;"
     width="51.5%">
<img src="./assets/config-ui-x_bridgesettings_enabled.postreboot.png"
     alt="Bridge Settings Disabled Postreboot"
     style="padding:2px 2px 2px 2px; border:2px solid; margin:0px 10px 0px 0px; vertical-align:top;"
     width="30%">

### Manual Configuration
If you would rather manually configure and run the plugin, you will find a sample _config.json_ file in the `./config` folder. It is left to the user to get the plugin up and running within homebridge. Refer to the section above for specifics on the configuration parameters.
## Usage
When the plugin-starts, it will create a _battery service_ accessory for each volume that does not match **any** of the patterns in the _exclusion list_. The _battery level_ for each accessory will be set to the percentage of storage space remaining on the volume. If the amount of remaining storage is below the _alert threahold_ the accessory will show the _low battery_ status.<br/>
When viewing the details of an accessory, the accessory information section will display the _Volume UUID_ (if known) under the _Serial Number_ field and the _volume format_ under the _Model_ field. The plug-in version will show under the _Firmware_ field.<br/>
<img src="./assets/home_app_ios_volume.png"
     alt="Home app ios volume"
     style="padding:2px 2px 2px 2px; border:2px solid; margin:0px 10px 0px 0px; vertical-align:top;"
     width="15.2%">
<img src="./assets/home_app_ios_volume_with_alert.png"
     alt="Home app ios volume with alert"
     style="padding:2px 2px 2px 2px; border:2px solid; margin:0px 10px 0px 0px; vertical-align:top;"
     width="15%">

The volumes on the system will be rescanned both (a) peropdically according to the polling interval specified in the configuration settings and (b) when the contents of the `/Volumes` folder changes.

- _Refresh_: This switch, when turned on, is used to initiate a rescan of the volumes on the system. The user is not permitted to turn the switch off. It will automatically turn off when the scan is complete. This allows the user to update the _battery service_ accessories without needing to wait for the polling interval to expire.
- _Purge_: When this switch is turned on, _battery service_ accessories that correspond to volumes that are no longer identified, for example ones that have been dismounted, will be removed (or purged). When this switch is off, any volumes that have been dismounted or now match one of the exclusion masks will show the battery level and battery alert as _Not Reachable_. Homekit applications will render these _not reachable_ differently. For example, the Apple Home app will simply not display the Battery Level and Low Battery Status. Other applications like [Home+ 5](https://apps.apple.com/us/app/home-5/id995994352) app shows the accessories as _Error_. The state of this switch is persisted across sessions.

If customizing the `exclusion_list` configuration, it is left to the user to know the volume mount point and to be able to craft an appropriate regular expression for the volume(s) of interest.
## Restrictions
This module operates by using shell commands to the `diskutil` program. Therefore, this module is only supported on the Apple OSX and macOS operating systems.

## Known Issues and Planned Enhancements
Refer to the bugs and enhancements listed [here](https://github.com/pricemi115/homebridge-grumptech-volmon/issues)

## Contributing

1. Fork it!
2. Create your feature/fix branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request

## Credits

Many thanks to all the folks contributing to [Homebridge](https://homebridge.io) and to [oznu](https://github.com/oznu) for [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x), allowing for the possibility of this sort of fun and learning.

## License

Refer to [LICENSE.md](./LICENSE.md) for information regarding licensing of this source code.
