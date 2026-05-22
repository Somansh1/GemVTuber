const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [path.join(__dirname, 'src', 'renderer', 'index.js')],
  bundle: true,
  outfile: path.join(__dirname, 'dist', 'renderer', 'bundle.js'),
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
  minify: false,
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  loader: {
    '.js': 'js',
  },
  // PixiJS expects a global PIXI object; pixi-live2d-display imports it
  external: [],
  logLevel: 'info',
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('👀 Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('✅ Build complete!');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
