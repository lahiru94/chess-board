// Fails the build when a compressed size budget is exceeded (PLAN.md 6.1).
// Sizes are Brotli (what the host serves); gzip is printed for reference.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const DIST = 'dist';
const KB = 1024;

const BUDGETS = {
  initial: 25 * KB,
  view3d: 200 * KB,
  skin2d: 10 * KB,
  skin3d: 30 * KB,
};

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function sizes(file) {
  const buf = readFileSync(file);
  return {
    raw: buf.length,
    br: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    gz: gzipSync(buf, { level: 9 }).length,
  };
}

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

// Initial load = index.html + every asset it references directly.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const referenced = new Set(
  [...html.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((m) => join(DIST, m[1])),
);
const initialFiles = [join(DIST, 'index.html'), ...referenced];

const groups = { initial: initialFiles, view3d: [], skin2d: [], skin3d: [], other: [] };
for (const file of walk(DIST)) {
  if (initialFiles.includes(file) || !/\.(js|css|svg|html)$/.test(file)) continue;
  const name = relative(DIST, file);
  if (/view3d/i.test(name)) groups.view3d.push(file);
  else if (/skin.*2d|2d.*skin/i.test(name)) groups.skin2d.push(file);
  else if (/skin.*3d|3d.*skin/i.test(name)) groups.skin3d.push(file);
  else groups.other.push(file);
}

let failed = false;
for (const [group, files] of Object.entries(groups)) {
  if (files.length === 0) continue;
  const budget = BUDGETS[group];
  // Skins are budgeted one file each; other groups as a total.
  const perFile = group.startsWith('skin');
  let total = { raw: 0, br: 0, gz: 0 };
  console.log(`\n${group}${budget ? ` (budget ${fmt(budget)}${perFile ? ' each' : ''})` : ''}`);
  for (const file of files) {
    const s = sizes(file);
    total = { raw: total.raw + s.raw, br: total.br + s.br, gz: total.gz + s.gz };
    const over = perFile && budget && s.br > budget;
    if (over) failed = true;
    console.log(`  ${over ? '✗' : ' '} ${relative(DIST, file).padEnd(40)} ${fmt(s.br).padStart(9)} br  ${fmt(s.gz).padStart(9)} gz  ${fmt(s.raw).padStart(9)} raw`);
  }
  if (!perFile && files.length > 1) {
    console.log(`    ${'total'.padEnd(40)} ${fmt(total.br).padStart(9)} br  ${fmt(total.gz).padStart(9)} gz`);
  }
  if (!perFile && budget && total.br > budget) {
    failed = true;
    console.log(`  ✗ ${group} is over budget by ${fmt(total.br - budget)}`);
  }
}

console.log(failed ? '\nSize check FAILED.' : '\nSize check passed.');
process.exit(failed ? 1 : 0);
