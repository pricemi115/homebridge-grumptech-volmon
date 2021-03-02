# Change Log
Change history for _homebridge-grumptech-volmon_

---
---
## [1.0.0] - 2021-03-01
### What's new
- [ISSUE #2](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/2)<br/>
  Updated documentation for release.
---
## [0.0.8] (Beta 4) - 2021-02-27
### What's new
- [ISSUE #3](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/3)<br/>
  Added a switch named `Refresh` to the plug-in. Changing the switch to _on_ will initiate a re-scan of the volumes.<br/>
  While the scan is in progress, the user is not permitted to turn the switch off. It will return to the _off_ state<br/>
  automatically when the scan completes.<br/>
### Fixes & Changes
- Homebridge Stability: `homebridge` resources were being imported into the deployed script.<br/>
  This could have resulted in stability issues, especially when the plugin is started/restarted.
- Most debug logging was adjusted to only print when `homebridge` is running in debug mode.
- Once the plugin is running, accessories for volumes that become dismounted or invisible will no longer be removed on the next scan.<br/>
  Instead, these accessories will show as `Not reachable` or `Error`.<br/>
---
## [0.0.7] (Beta 3) - 2021-02-23

### Fixes & Changes
- FIXED: CHANGELOG.md was located correctly and now deployed.

---
## [0.0.6] (Beta 2) - 2021-02-23

### Fixes & Changes
- [ISSUE #1](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/1)<br/>
  AFFECTED SYSTEMS: Partitioned Drives (non-APFS), Volumes formatted with unrecognized file system.<br/>
  FIXED: Drives that are partitioned are properly discovered.<br/>
  FIXED: Volumes with the FAT32, MSDOS, NTFS, and UDF (Univerdal Disk Format) file systems now recognized.<br/>
  CHANGED: Volumes without a Volume UUID will use the device node as the serial number
---
## [0.0.5] (Beta 1) - 2021-02-21

### What's new
- Initial release

