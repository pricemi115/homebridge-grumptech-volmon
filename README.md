# Homebridge Volume Monitor

[Homebridge Volume Monitor](https://github.com/pricemi115/), by [GrumpTech](https://github.com/pricemi115/), is a [Homebridge](https://homebridge.io) dynamic platform plug-in that allows information for mounted volumes to be published as _Battery Service_ accessories indicating. The battery level indicates percentage of free space remaining.

## Installation

This plug-in is intended to be used with the [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x) homebridge management tool. If using _homebridge-config-ui-x_, simply search for _homebridge-grumptech-volmon_ for installation and plug-in management and configuration.

To install the plugin manually:
<br>_`npm install -g homebridge-grumptech-volmon`_

## Usage

- TODO: Write actual usage instructions, but there is almost nothing for the user to do.
- TODO: Explain/Describe the process for configuring the plugin to be an _isolated child bridge_

## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request

## History

Version | Release Date | Comments
------: | :----------: | :-------
0.0.5   | 2021-FEB-20 | Initial release to npm

## Known Issues
* (TODO: bug reference):
<br>Drobo 5D (direct connect Drobo) not detected as a _mounted, & visible_ volume. Thus, an accressory representing this volume is not published to Homekit.
* (TODO: feature reference):
<br>Must wait for the polling interval to see updates. Intend to add the ability for the user to force an update without having to wait for the polling interval to complete.

## Contributing

1. Fork it!
2. Create your feature/fix branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request

## Credits

Many thanks to all the folks contributing to [Homebridge](https://homebridge.io) and to [oznu](https://github.com/oznu) for [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x), allowing for the possibility of this sort of fun and learning.

## License

Copyright 2021 - _Michael J. Price_

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.