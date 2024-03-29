### Metabolic Atlas Map Viewer 3D

This is a 3D graph viewer to visualize the metabolic atlas compound graph (metabolic network), which is used as a self-contained feature of [Metabolic Atlas](https://metabolicatlas.org). The purpose of this library is to deliver the right technical solution that allows Metabolic Atlas to provide users with a useful experience while browsing and modifying a very large graph, with minimal knowledge required. The solution should be easy to work with and easy to maintain by programmers. The expectation is that most of the users of Metabolic Atlas will be biologists, followed by bioinformaticians; this means the 3D viewer should be minimalistic and intuitive.

Below is a generic [metabolic network](https://en.wikipedia.org/wiki/Metabolic_network) example. Other graph structures are possible such as hiding genes, or duplicating currency metabolites (which occur in tens or even hundreds of reactions).

```
Gene - Reaction - Metabolite - Reaction - Metabolite
             |            |
Reaction - Metabolite - Reaction - Metabolite
  |
Gene
```

#### Installation

Install dependencies with `npm install`, then run `npm run dev` to start the development server, or `npm run prepare` to build and minify the current version of the viewer.

The current version of the build is done with rollup, controlled by `rollup.config.js`, and will bundle the app with three-js.

#### [Recommended] Setup commit hooks

The project uses `eslint` and `prettier` to help catch errors and format code. Some pre-commit actions are provided along with the project that runs the linter and formatter before finalizing each commit. To setup the pre and post commit hooks, please run the following:

```bash
git config core.hooksPath git_hooks
```

#### Notes

The library is automatically packaged and pushed to [npmjs.org](https://www.npmjs.com/package/@metabolicatlas/3d-network-viewer) via a GitHub Action. However, the action does not automatically bump the version, which means that occasional failures appear because of this. To bump up the version, edit the corresponding field in `package.json` (see [this commit](https://github.com/MetabolicAtlas/3d-network-viewer/commit/35f0770b9643cc4adb52bc0b5c3f572be1609203) as an example).
