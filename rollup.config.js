import nodePolyfills  from 'rollup-plugin-node-polyfills';
import json           from '@rollup/plugin-json';

export default {
  external: ['homebridge', 'fs'],
  input: 'src/main.js',
  output: [
    {
      file: 'dist/homebridge-grumptech-volmon.js',
      format: 'cjs',
      exports: 'named'
    },
  ],
  plugins: [
    nodePolyfills(),
    json()
  ]
};
