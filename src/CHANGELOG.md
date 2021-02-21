# Change Log
Change history for _homebridge-grumptech-volmon_

---
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

