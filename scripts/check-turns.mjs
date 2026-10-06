/**
 * Turn-rules smoke gate: src/manor/turns.ts (pure, no Phaser) behaves
 * byte-identically to the old GameScene.tryStep rules.
 *
 * - esbuild-bundles src/manor/turns.ts (esbuild ships in node_modules
 *   via vite — no new deps) and imports the bundle, so assertions run
 *   against the real TS source, not a copy.
 * - Asserts the bundle carries no Phaser import, then: a walkable step
 *   advances the actor, a wall blocks, a locked door reports shut with no
 *   time cost (actor untouched), an unlocked door moves, a portal
 *   on the destination resolves, diagonals are illegal, and the noon
 *   edge helper fires on the exact crossing edge.
 *
 * Usage: node scripts/check-turns.mjs
 * Exit 0 on agreement, non-zero with details on mismatch.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
let assertions = 0;
function check(name, actual, expected) {
  assertions += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}: expected ${e}, got ${a}`);
}

// --- bundle turns.ts via the repo's esbuild, import the bundle ---------------
const esbuild = require('esbuild');
const out = esbuild.buildSync({
  entryPoints: [join(ROOT, 'src', 'manor', 'turns.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const bundleText = out.outputFiles[0].text;
check('no-phaser-import', /from\s+['"]phaser['"]/.test(bundleText), false);
const tmpDir = mkdtempSync(join(tmpdir(), 'check-turns-'));
const bundlePath = join(tmpDir, 'turns.bundle.mjs');
writeFileSync(bundlePath, bundleText);
const turns = await import(pathToFileURL(bundlePath).href);

// --- fixture: 3x3 room, (0,0) wall, locked servant door at (2,1) --------------
const Iso = await import(pathToFileURL(join(tmpDir, 'IsoTiles.bundle.mjs')).href).catch(
  async () => {
    const isoOut = esbuild.buildSync({
      entryPoints: [join(ROOT, 'src', 'movement', 'IsoTiles.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      write: false,
    });
    const isoPath = join(tmpDir, 'IsoTiles.bundle.mjs');
    writeFileSync(isoPath, isoOut.outputFiles[0].text);
    return import(pathToFileURL(isoPath).href);
  },
);
const { TileActor } = Iso;

const walls = new Set(['0,0']);
const portals = new Map([
  ['2,1', { toRoom: 'library', to: { x: 0, y: 0 }, lockedBy: 'servant' }],
  ['1,2', { toRoom: 'library', to: { x: 5, y: 5 } }],
]);
const unlocked = new Set();
function stateAt(x, y) {
  return {
    actor: new TileActor({ x, y }, 4),
    isWalkable: (t) => t.x >= 0 && t.y >= 0 && t.x < 3 && t.y < 3 && !walls.has(`${t.x},${t.y}`),
    portalAt: (t) => portals.get(`${t.x},${t.y}`),
    isUnlocked: (k) => unlocked.has(k),
  };
}

// 1. walkable step advances (E from (1,1) -> (2,0)? no: E is (+1,0) -> (2,1)
//    is the locked door, so step S from (1,0) -> (1,1) instead).
let st = stateAt(1, 0);
let r = turns.resolveStep(st, 0, 1);
check('walk-kind', r.kind, 'moved');
check('walk-to', r.to, { x: 1, y: 1 });
check('walk-facing', r.facing, 4);
check('walk-cost', r.timeCost, 1);
check('walk-actor', st.actor.tile, { x: 1, y: 1 });
check('walk-actor-facing', st.actor.facing, 4);
check('walk-no-portal', r.portal, undefined);

// 2. wall blocks: W from (1,0) -> (0,0) is a wall.
st = stateAt(1, 0);
r = turns.resolveStep(st, -1, 0);
check('wall-kind', r.kind, 'blocked');
check('wall-at', r.at, { x: 0, y: 0 });
check('wall-actor-unmoved', st.actor.tile, { x: 1, y: 0 });
check('wall-actor-facing', st.actor.facing, 4);

// 3. locked door reports shut with no time cost: E from (1,1) -> (2,1).
st = stateAt(1, 1);
r = turns.resolveStep(st, 1, 0);
check('locked-kind', r.kind, 'locked');
check('locked-key', r.lockKey, 'servant');
check('locked-at', r.at, { x: 2, y: 1 });
check('locked-no-time-cost', 'timeCost' in r, false);
check('locked-actor-unmoved', st.actor.tile, { x: 1, y: 1 });

// 4. unlocked door moves through: same step with the key held.
unlocked.add('servant');
st = stateAt(1, 1);
r = turns.resolveStep(st, 1, 0);
check('unlocked-kind', r.kind, 'moved');
check('unlocked-to', r.to, { x: 2, y: 1 });
check('unlocked-facing', r.facing, 2);
unlocked.delete('servant');

// 5. portal resolves on a plain (unlocked) door tile: S from (1,1) -> (1,2).
st = stateAt(1, 1);
r = turns.resolveStep(st, 0, 1);
check('portal-kind', r.kind, 'moved');
check('portal-resolves', r.portal, {
  toRoom: 'library',
  to: { x: 5, y: 5 },
});

// 6. diagonal (vertex-touching) steps are illegal.
st = stateAt(1, 1);
r = turns.resolveStep(st, 1, 1);
check('diag-kind', r.kind, 'illegal');
check('diag-actor-unmoved', st.actor.tile, { x: 1, y: 1 });

// 7. noon edge helper fires on the exact crossing edge (day 1 noon = 240).
// (Chimes render scene-side via the clock subscription; resolution never
// touches the clock, so the helper is asserted directly.)
check('chime-cross', turns.noonsCrossed(239, 240, new Set()), [1]);
check('chime-before', turns.noonsCrossed(238, 239, new Set()), []);
check('chime-rung-once', turns.noonsCrossed(239, 240, new Set([1])), []);

// 8. noon helper matches the old checkNoonChime loop (day offsets).
check('noon-day1', turns.noonElapsedForDay(1), 240);
check('noon-day2', turns.noonElapsedForDay(2), 1680);
check('noon-day3', turns.noonElapsedForDay(3), 3120);

rmSync(tmpDir, { recursive: true, force: true });
if (failures.length) {
  for (const f of failures) console.error(`check-turns FAIL: ${f}`);
  process.exit(1);
}
console.log(`check-turns: OK (${assertions} assertions)`);
