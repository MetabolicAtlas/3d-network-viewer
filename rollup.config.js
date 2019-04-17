import resolve from 'rollup-plugin-node-resolve';

export default {
    input: 'src/main.js',
    output: {
        file: 'public/met-atlas-viewer.js',
        format: 'umd',
        name: 'MetAtlasViewer'
    },
    plugins: [
        resolve()
    ]
};
