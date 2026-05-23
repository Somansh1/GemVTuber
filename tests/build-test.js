const esbuild = require('esbuild');
const path = require('path');

const buildOptions = {
  entryPoints: [path.join(__dirname, 'mouth-test-app.js')],
  bundle: true,
  outfile: path.join(__dirname, 'bundle-test.js'),
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
  external: [],
  logLevel: 'info',
};

async function build() {
  try {
    await esbuild.build(buildOptions);
    console.log('✅ Test Build complete!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

build();
