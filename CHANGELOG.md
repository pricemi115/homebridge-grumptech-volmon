# Change Log
Change history for _homebridge-grumptech-volmon_

---
---
---

## [1.3.3] - 2023-01-06

### Fixed
- [Issue #47](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/47): Fixed issue where the Refresh switch could become stuck and the module would stop detecting changes to the filesystem.

### Internal Cleanup
- Updated dependencies
- Determine version number and other configuration settings at build/bundling time as opposed to reading the `package.json` file at runtime.

## [1.3.2] - 2022-07-06 (Belated 4th of July Release 🎇)
### What's new
- Just some internal cleanup:
-- Switched the bundler from rollup to webpack
-- Updated dependencies
-- Removed internal `spawnHelper` module and switched to the published `grumptech-spawn-helper` module.
- Note: if your operating system is not supported, please submit a request [here](https://github.com/pricemi115/homebridge-grumptech-volmon/issues) or, better yet, contribute a solution.

- Just some internal cleanup:
-- Switched the bundler from rollup to webpack
-- Updated dependencies
-- Removed internal `spawnHelper` module and switched to the published `grumptech-spawn-helper` module.
- Note: if your operating system is not supported, please submit a request [here](https://github.com/pricemi115/homebridge-grumptech-volmon/issues) or, better yet, contribute a solution.

## [1.3.1] - 2021-11-07 (Thanskgiving Release 🦃)
This update is not a turkey !
### What's new
- [Issue #30](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/30): Support for additional operating systems. Included in this release is support for the _linux_ operating system.
- Note: if your operating system is not supported, please submit a request [here](https://github.com/pricemi115/homebridge-grumptech-volmon/issues) or, better yet, contribute a solution.

### Fixed
- Disconnected/dismounted volumes would be republished to homekit and then be immediately removed on each scan. End users would never observe this issue using homekit, but the issue was apparent when studying the homebridge logs.

---
## [1.2.1] - 2021-10-25 (Autumn Release 🎃🎃)
Happy Halloween!! Apparently, prior versions did indeed contain a trick!! Sorry about that.
### Fixed
- [Issue #31](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/31): Graceful handling of unsupported operating systems. Previously, installation on an unsupported operating system would result in homebridge rebooting indefinitely. Appologies to any who were affected by this issue.

---
## [1.2.0] - 2021-10-21 (Autumn Release 🎃)
Happy Halloween!! This update is "all treat", no tricks.
### What's new
- [Issue #23](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/23): Added support for remote volumes mounted via SMB
- Previously, the plug in would only recognize volumes in `/Volumes`. Now all mounted volumes are detected and the user can specify a regular expression mask to exclude volumes from detection. Common masks are set by default to exclude Time Machine APFS volumes and other "internal" volumes that are present on current versions of masOS.

### Fixed
- Updated all dependencies.

---
## [1.1.0] - 2021-08-01 (Summer Release 🌞)
While relaxing this summer and basking in the glow of the sun, enjoy a better user experience with this update to the VolMon plug-in.
### What's new
- [Issue #22](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/22): Added support to automatically re-scan the volumes when changes to `/Volumes` occur.
- [Issue #12](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/12): Added support for per-volume customization of the threshold used for determining the state of the low space alert.
- [Issue #11](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/11): Added support for disabling the low space alert on a per-volume basis.
- [Issue #16](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/16): Added support to automatically remove offline/non-visible volumes. Set the `Purge` switch to on.

---
## [1.0.1] - 2021-05-29
### Fixed
- [CVE-2021-21366] - Update dependencies to resolve security vulnerability CVE-2021-21366.
- Added a security policy detailing how to report security vulnerabilities.

---
## [1.0.0] - 2021-03-01
### What's new
- Initial release.
- [ISSUE #2](https://github.com/pricemi115/homebridge-grumptech-volmon/issues/2)
---
