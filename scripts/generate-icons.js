#!/usr/bin/env node

/**
 * Generate PWA icons from the SVG source
 *
 * Requires: npm install sharp
 * Usage: node scripts/generate-icons.js
 *
 * Alternatively, use an online tool like:
 * - https://realfavicongenerator.net/
 * - https://www.pwabuilder.com/imageGenerator
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
try {
  const sharp = require('sharp');

  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  const svgPath = path.join(__dirname, '../public/icons/icon.svg');
  const outputDir = path.join(__dirname, '../public/icons');

  const svgBuffer = fs.readFileSync(svgPath);

  Promise.all(
    sizes.map(({ name, size }) =>
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(outputDir, name))
        .then(() => console.log(`Generated ${name}`))
    )
  ).then(() => console.log('Done!'));

} catch (err) {
  console.log('Sharp not installed. To generate PNG icons:');
  console.log('');
  console.log('  1. Install sharp: npm install --save-dev sharp');
  console.log('  2. Run this script: node scripts/generate-icons.js');
  console.log('');
  console.log('Or use an online PWA icon generator:');
  console.log('  - https://realfavicongenerator.net/');
  console.log('  - https://www.pwabuilder.com/imageGenerator');
  console.log('');
  console.log('Upload public/icons/icon.svg and download the generated PNGs.');
}
