// eslint-disable-next-line no-multi-spaces
import nodePolyfills  from 'rollup-plugin-node-polyfills';
// eslint-disable-next-line no-multi-spaces
import json           from '@rollup/plugin-json';

export default {
    external: ['homebridge', 'fs', 'fs/promises'],
    input: 'src/main.js',
    output: [
        {
            file: 'dist/homebridge-grumptech-volmon.js',
            format: 'cjs',
            exports: 'named',
        },
    ],
    plugins: [
        nodePolyfills(),
        json(),
    ],
};
