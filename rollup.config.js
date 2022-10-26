import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/main.js',
  output: {
    file: 'public/met-atlas-viewer.js',
    format: 'esm',
    name: 'MetAtlasViewer',
  },
  plugins: [nodeResolve()],
};
