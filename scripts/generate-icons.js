#!/usr/bin/env node

/**
 * Generate PWA icons and favicon from the SVG source
 *
 * Requires: npm install sharp png-to-ico
 * Usage: node scripts/generate-icons.js
 *
 * Alternatively, use an online tool like:
 * - https://realfavicongenerator.net/
 * - https://www.pwabuilder.com/imageGenerator
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const sharp = require('sharp');

  const svgPath = path.join(__dirname, '../public/icons/icon.svg');
  const outputDir = path.join(__dirname, '../public/icons');
  const appDir = path.join(__dirname, '../src/app');

  const svgBuffer = fs.readFileSync(svgPath);

  // PWA icons
  const pwaIcons = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  // Generate PWA icons
  await Promise.all(
    pwaIcons.map(({ name, size }) =>
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(outputDir, name))
        .then(() => console.log(`Generated ${name}`))
    )
  );

  // Generate favicon sizes (16, 32, 48 for ICO)
  const faviconSizes = [16, 32, 48];
  const faviconPngs = await Promise.all(
    faviconSizes.map(size =>
      sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );

  // Try to create ICO if png-to-ico is available
  try {
    const pngToIco = require('png-to-ico');
    const icoBuffer = await pngToIco(faviconPngs);
    fs.writeFileSync(path.join(appDir, 'favicon.ico'), icoBuffer);
    console.log('Generated favicon.ico');
  } catch {
    // Fallback: just copy the 32px PNG as a simple favicon
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(path.join(outputDir, 'favicon-32.png'));
    console.log('Generated favicon-32.png (install png-to-ico for .ico)');
  }

  console.log('Done!');
}

// Check if sharp is available
try {
  require.resolve('sharp');
  generateIcons().catch(console.error);
} catch {
  console.log('Sharp not installed. To generate icons:');
  console.log('');
  console.log('  1. Install dependencies:');
  console.log('     npm install --save-dev sharp png-to-ico');
  console.log('');
  console.log('  2. Run this script:');
  console.log('     node scripts/generate-icons.js');
  console.log('');
  console.log('Or use an online PWA icon generator:');
  console.log('  - https://realfavicongenerator.net/');
  console.log('  - https://www.pwabuilder.com/imageGenerator');
  console.log('');
  console.log('Upload public/icons/icon.svg and download the generated files.');
}
