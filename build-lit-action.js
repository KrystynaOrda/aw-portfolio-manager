import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildLitAction() {
  try {
    // First build the raw bundle
    await esbuild.build({
      entryPoints: [resolve(__dirname, './src/backend/lit-action.ts')],
      bundle: true,
      minify: false,
      format: 'iife',
      outfile: resolve(__dirname, './dist/temp-lit-action.js'),
      target: ['es2020'],
    });

    // Read the generated file
    let rawBundle = fs.readFileSync(resolve(__dirname, './dist/temp-lit-action.js'), 'utf8');
    
    // Remove "use strict"; and ensure single IIFE structure
    rawBundle = rawBundle
      .replace(/"use strict";/, '')
      .replace(/^var \w+ = /, '')
      .trim();

    // Wrap the content in the export template literal
    const wrappedContent = `export const litAction = \`${rawBundle}\`;`;

    // Write the wrapped content to the final file
    fs.writeFileSync(resolve(__dirname, './dist/lit-action2.js'), wrappedContent);

    // Clean up temporary file
    fs.unlinkSync(resolve(__dirname, './dist/temp-lit-action.js'));

    console.log('Successfully built lit-action2.js');
  } catch (error) {
    console.error('Error building lit-action:', error);
    process.exit(1);
  }
}

buildLitAction();
