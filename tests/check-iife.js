const fs = require('fs');
const code = fs.readFileSync('node_modules/untitled-pixi-live2d-engine/dist/cubism.min.js', 'utf8');
console.log(code.substring(0, 100));
