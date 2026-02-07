/**
 * Download Inter font files for OG image generation.
 *
 * Satori (@vercel/og engine) requires WOFF/TTF fonts as ArrayBuffers.
 * Bundling fonts locally avoids DNS+TLS+download latency on every
 * Edge function cold start (~100-380ms savings).
 *
 * Run: node scripts/download-fonts.mjs
 * Also runs automatically via the "prebuild" npm script.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { get } from "https";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(
  __dirname,
  "../src/app/api/og/board/fonts",
);

const FONTS = [
  {
    name: "Inter-Bold.woff",
    url: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff",
  },
  {
    name: "Inter-Regular.woff",
    url: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hjp-Ek-_EeA.woff",
  },
];

function download(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  mkdirSync(FONTS_DIR, { recursive: true });

  for (const font of FONTS) {
    const dest = join(FONTS_DIR, font.name);
    if (existsSync(dest)) {
      console.log(`  ✓ ${font.name} (already exists)`);
      continue;
    }
    try {
      const data = await download(font.url);
      writeFileSync(dest, data);
      console.log(`  ✓ ${font.name} (${data.length} bytes)`);
    } catch (err) {
      console.error(`  ✗ ${font.name}: ${err.message}`);
      process.exit(1);
    }
  }
}

console.log("Downloading OG image fonts...");
main().then(() => console.log("Done."));
