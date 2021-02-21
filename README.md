# Homebridge Volume Monitor

[Homebridge Volume Monitor](https://github.com/pricemi115/homebridge-grumptech-volmon), by [GrumpTech](https://github.com/pricemi115/), is a [Homebridge](https://homebridge.io) dynamic platform plug-in that allows information for mounted volumes to be published as _Battery Service_ accessories indicating the percentage of free space remaining.

## Installation

This plug-in is intended to be used with the [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x) homebridge management tool. If using _homebridge-config-ui-x_, simply search for _homebridge-grumptech-volmon_ for installation and plug-in management and configuration.

To install the plugin manually:
<br>_`npm install -g homebridge-grumptech-volmon`_

## Usage

- TODO: Write actual usage instructions, but there is almost nothing for the user to do.
- TODO: Explain/Describe the process for configuring the plugin to be an _isolated child bridge_

## Restrictions
This module operates by using shell commands to the `diskutil` program. Therefore, this module is only supported on the Apple OSX and macOS operating systems.

## History

Version | Release Date | Comments
------: | :----------: | :-------
0.0.5   | 2021-FEB-20 | Initial release to npm
0.0.6   | 2021-FEB-23 | Big fix(es) and minor documentation updates.
## Known Issues
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

Copyright 2021 - _Michael J. Price_

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.