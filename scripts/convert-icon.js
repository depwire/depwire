#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function convertIcon() {
  const svgPath = join(__dirname, '..', 'icon.svg');
  const pngPath = join(__dirname, '..', 'icon.png');
  
  const svgBuffer = readFileSync(svgPath);
  
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(pngPath);
  
  console.log('Generated icon.png (512x512)');
}

convertIcon().catch(console.error);
