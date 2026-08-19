// Packaging entry point for `npm run build:electron`.
//
// WHY THIS WRAPPER EXISTS
//
// electron-builder extracts the Electron runtime into "<out>/win-unpacked.tmp"
// and then renames that folder to "<out>/win-unpacked". On Windows, that
// rename fails with EPERM whenever something holds a directory-change
// notification handle on the freshly created folder — which is exactly what
// Search Indexer, Defender and file-sync clients do to indexed locations like
// Desktop, Documents and OneDrive folders.
//
// The failure was verified to be that, and not a permissions or file-lock
// problem: the extracted electron.exe opens exclusively with no sharing (so no
// file inside is locked), the folder's ACLs grant Full Control, a freshly
// created empty folder renames fine in the same parent, and the identical
// build succeeds when its output goes somewhere under %TEMP%.
//
// So: always stage the build under the OS temp directory, then copy the
// finished installers back into release/. Copying files is unaffected by the
// notification handles that block a directory rename. This keeps
// `npm run build:electron` working with no flags to remember, no dependency on
// where the project happens to be checked out, and without asking anyone to
// weaken an antivirus or indexing setting.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');
const STAGING_DIR = path.join(os.tmpdir(), 'steam-stats-build');

// Distributable outputs. win-unpacked/ is deliberately not copied — it's
// ~300MB of loose files that only matter for debugging, and it stays in the
// staging directory (path printed below) if it's ever needed.
const ARTIFACT_PATTERN = /\.(exe|blockmap)$|^latest\.yml$/;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nStaging build in ${STAGING_DIR}`);
console.log('(see the comment in tools/build-app.mjs for why it is not built in place)\n');

fs.rmSync(STAGING_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGING_DIR, { recursive: true });

run('npx', ['electron-builder', `-c.directories.output=${STAGING_DIR}`]);

fs.mkdirSync(RELEASE_DIR, { recursive: true });

const copied = [];
for (const entry of fs.readdirSync(STAGING_DIR)) {
  if (!ARTIFACT_PATTERN.test(entry)) continue;
  const from = path.join(STAGING_DIR, entry);
  if (!fs.statSync(from).isFile()) continue;
  fs.copyFileSync(from, path.join(RELEASE_DIR, entry));
  copied.push({ name: entry, size: fs.statSync(from).size });
}

if (copied.length === 0) {
  console.error('\n❌ electron-builder produced no distributable artifacts.');
  process.exit(1);
}

console.log('\n✅ Build complete — artifacts in release/\n');
for (const { name, size } of copied) {
  console.log(`   ${name.padEnd(38)} ${(size / 1024 / 1024).toFixed(1)} MB`);
}
console.log(`\n   Unpacked app (for debugging): ${path.join(STAGING_DIR, 'win-unpacked')}\n`);
