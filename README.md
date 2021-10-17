### Metabolic Atlas Map Viewer 3D

This is a 3D graph viewer to visualize the metabolic atlas compound graph (metabolic network). See the [wiki](../../wiki) for more details.

Install dependencies with `npm install`, then run `npm run dev` to start the development server, or `npm run prepare` to build and minify the current version of the viewer.

The current version of the build is done with rollup, controlled by `rollup.config.js`, and will bundle the app with three-js.

The library is automatically packaged and pushed to [npmjs.org](https://www.npmjs.com/package/@metabolicatlas/3d-network-viewer) via a GitHub Action. However, the action does not automatically bump the version, which means that occasional failures appear because of this.
