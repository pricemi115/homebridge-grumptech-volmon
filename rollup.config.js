import nodePolyfills  from 'rollup-plugin-node-polyfills';

export default {
  external: ['events'],
  input: 'src/main.js',
  output: [
    {
      file: 'dist/grumptech-fs-interrogator.js',
      format: 'cjs',
      exports: 'named'
    },
  ],
  plugins: [
    nodePolyfills()
  ]
};
