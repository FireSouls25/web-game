/**
 * Projection conformance gate: IsoTiles (the only tile-projection home)
 * vs the scripts/iso-preview.mjs mirror.
 *
 * - esbuild-bundles src/movement/IsoTiles.ts (esbuild ships in node_modules
 *   via vite — no new deps) and imports the bundle, so assertions run
 *   against the real TS source, not a copy.
 * - Imports the preview's mirrors (groupDoorTiles / doorSpriteFor /
 *   stairVariantFor / previewTileToScreen) and asserts they agree with the
 *   bundle on two fixture rooms: one with a 2x2 door block, one with a
 *   3-deep stair run.
 *
 * Usage: node scripts/check-projection.mjs
 * Exit 0 on agreement, non-zero with details on the first mismatch class.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
// Key-order-insensitive structural compare (preview builds slot objects
// with a different key order than the snapshots below).
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
function check(name, actual, expected) {
  if (canon(actual) !== canon(expected)) {
    failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// --- bundle IsoTiles via the repo's esbuild, import the bundle ---------------
const esbuild = require('esbuild');
const out = esbuild.buildSync({
  entryPoints: [join(ROOT, 'src', 'movement', 'IsoTiles.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const tmpDir = mkdtempSync(join(tmpdir(), 'check-projection-'));
const bundlePath = join(tmpDir, 'IsoTiles.bundle.mjs');
writeFileSync(bundlePath, out.outputFiles[0].text);
const iso = await import(pathToFileURL(bundlePath).href);

// --- preview mirrors (import-only; its CLI main is argv-guarded) --------------
const preview = await import('./iso-preview.mjs');

// --- 1. default projection stays 64x32 ----------------------------------------
check('TILE_W', iso.TILE_W, 64);
check('TILE_H', iso.TILE_H, 32);
check('SPRITE_SCALE', iso.SPRITE_SCALE, 0.25);

const proj64 = iso.makeProjection(64);
check('makeProjection(64).tileW', proj64.tileW, 64);
check('makeProjection(64).tileH', proj64.tileH, 32);
check('makeProjection(64).spriteScale', proj64.spriteScale, 0.25);
for (const [x, y] of [[0, 0], [3, 5], [-2, 4]]) {
  check(`tileToScreen(${x},${y}) default`, iso.tileToScreen(x, y), proj64.tileToScreen(x, y));
  check(`tileFootScreen(${x},${y}) default`, iso.tileFootScreen(x, y), proj64.tileFootScreen(x, y));
  check(`depthFor(${x},${y}) default`, iso.depthFor(x, y, 0.2), proj64.depthFor(x, y, 0.2));
}

// --- 2. fixture rooms ----------------------------------------------------------
// A: 2x2 door block (non-linear opening -> solo arch on the primary tile).
const doorRoom = {
  tiles: ['#####', '#EE.#', '#EE.#', '#...#', '#####'],
  portals: [{ from: { x: 1, y: 1 } }],
};
// B: 3-deep single-column stair run (upper tiles continue the flight).
const stairRoom = {
  tiles: ['###', '#>#', '#>#', '#>#', '#.#', '###'],
  portals: [],
};

const isWallCh = (tiles, x, y) => tiles[y]?.[x] === '#' || tiles[y]?.[x] === 'G';
// GameScene.doorAxis mirror: walls only (#/G), S on ambiguity.
const doorAxisAt = (tiles) => (x, y) => {
  const ax = isWallCh(tiles, x - 1, y) || isWallCh(tiles, x + 1, y);
  const ay = isWallCh(tiles, x, y - 1) || isWallCh(tiles, x, y + 1);
  if (ax && !ay) return 'S';
  if (ay && !ax) return 'E';
  return 'S';
};
const portalSet = (room) => new Set((room.portals ?? []).map((p) => `${p.from.x},${p.from.y}`));
const shutSet = (room) =>
  new Set((room.portals ?? []).filter((p) => p.lockedBy).map((p) => `${p.from.x},${p.from.y}`));

// --- 3. geometry: preview placement agrees with the bundle -------------------
// Preview renders at native 256x128; game/menu widths must scale linearly.
const proj256 = iso.makeProjection(256);
const proj112 = iso.makeProjection(112);
check('makeProjection(112).tileH', proj112.tileH, 56);
for (const room of [doorRoom, stairRoom]) {
  for (let y = -2; y < room.tiles.length + 2; y++) {
    for (let x = -2; x < (room.tiles[0]?.length ?? 0) + 2; x++) {
      const p = preview.previewTileToScreen(x, y);
      check(`preview==bundle256 (${x},${y})`, proj256.tileToScreen(x, y), p);
      const g64 = proj64.tileToScreen(x, y);
      check(`bundle64 scales (${x},${y})`, g64, { sx: p.sx / 4, sy: p.sy / 4 });
      const g112 = proj112.tileToScreen(x, y);
      check(`bundle112 scales (${x},${y})`, g112, { sx: (p.sx * 112) / 256, sy: (p.sy * 112) / 256 });
      // Round-trips on the bundle (ground plane + foot anchor).
      check(`screenToTile o tileToScreen (${x},${y})`, proj64.screenToTile(g64.sx, g64.sy), { x, y });
      const foot = proj64.tileFootScreen(x, y);
      check(`tileFromFoot o tileFootScreen (${x},${y})`, proj64.tileFromFoot(foot.tx, foot.ty), { x, y });
    }
  }
}
// Painter's order: depth grows with x+y regardless of width.
check('depthFor order', proj256.depthFor(0, 0) < proj256.depthFor(1, 0), true);
check('depthFor order 2', proj64.depthFor(1, 0) < proj64.depthFor(1, 1), true);
check('depthFor layer', proj64.depthFor(2, 2, 0.2), 40.2);

// --- 4. door-block mirror ------------------------------------------------------
{
  const ps = portalSet(doorRoom);
  const ss = shutSet(doorRoom);
  const slots = preview.groupDoorTiles(
    doorRoom,
    (x, y) => ps.has(`${x},${y}`),
    (x, y) => ss.has(`${x},${y}`),
    doorAxisAt(doorRoom.tiles),
  );
  check('door block slot count', slots.size, 4);
  for (const [key, want] of [
    ['1,1', { axis: 'S', pos: 0, count: 4, leaf: true, hasPortal: true, shut: false, hidden: false, block: true }],
    ['2,1', { axis: 'S', pos: 2, count: 4, leaf: false, hasPortal: true, shut: false, hidden: true, block: true }],
    ['1,2', { axis: 'S', pos: 1, count: 4, leaf: false, hasPortal: true, shut: false, hidden: true, block: true }],
    ['2,2', { axis: 'S', pos: 3, count: 4, leaf: false, hasPortal: true, shut: false, hidden: true, block: true }],
  ]) {
    check(`door block slot ${key}`, slots.get(key), want);
  }
  check('door block primary sprite', preview.doorSpriteFor(slots.get('1,1')), 'doorOpen:S');
  check('door block hidden sprite', preview.doorSpriteFor(slots.get('2,2')), null);
}

// --- 5. stair-run mirror -------------------------------------------------------
{
  const isStair = (x, y) => stairRoom.tiles[y]?.[x] === '>';
  check('stair top continues', preview.stairVariantFor(1, 1, isStair), 'steps:E');
  check('stair middle continues', preview.stairVariantFor(1, 2, isStair), 'steps:E');
  check('stair bottom flight', preview.stairVariantFor(1, 3, isStair), 'stairs:E');
}

rmSync(tmpDir, { recursive: true, force: true });

if (failures.length) {
  console.error(`check-projection: ${failures.length} mismatch(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('check-projection: OK (IsoTiles bundle agrees with iso-preview mirrors)');
