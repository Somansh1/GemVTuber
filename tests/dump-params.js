const fs = require('fs');

// We have to read the moc3 binary to see the parameter names
// The easiest way is to just grep the moc3 file for strings!
const moc3Path = "C:\\Users\\soman\\Downloads\\github projects\\gem-vtuber\\models\\Allium企划\\Allium模型本体\\ariu\\ariu.moc3";
const buffer = fs.readFileSync(moc3Path);

// Extract all ASCII strings of length >= 4
const strings = [];
let currentStr = '';

for (let i = 0; i < buffer.length; i++) {
  const byte = buffer[i];
  if (byte >= 32 && byte <= 126) {
    currentStr += String.fromCharCode(byte);
  } else {
    if (currentStr.length >= 4) {
      strings.push(currentStr);
    }
    currentStr = '';
  }
}

// Filter strings that look like parameters
const params = strings.filter(s => s.toLowerCase().includes('param'));
console.log("Found Parameters:");
console.log(Array.from(new Set(params)).join('\n'));

// Also look for mouth/lip strings
const mouthParams = strings.filter(s => s.toLowerCase().includes('mouth') || s.toLowerCase().includes('lip'));
console.log("\nFound Mouth/Lip strings:");
console.log(Array.from(new Set(mouthParams)).join('\n'));
