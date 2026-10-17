import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFile } from 'node:fs/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  stdin: {
    contents: "import QRCode from 'qrcode'; window.NearlyQRCode = QRCode;",
    resolveDir: root,
    sourcefile: 'nearly-qr-entry.js',
  },
  outfile: resolve(root, 'public/print/qrcode.bundle.js'),
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  legalComments: 'eof',
});
await copyFile(resolve(root, 'node_modules/qrcode/license'), resolve(root, 'public/print/qrcode-LICENSE.txt'));
console.log('Built local QR generator for the printable opt-in card.');
