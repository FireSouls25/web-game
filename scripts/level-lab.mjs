/**
 * Level lab: test the AI difficulty/map-design pipeline WITHOUT cloud.
 * No key, no network, no `vercel dev` needed.
 *
 *   node scripts/level-lab.mjs [--theme dungeon] [--depth 2] [--seed 7]
 *     [--print-prompt] [--mock-file path/to/ai-output.json] [--live]
 *
 * What it covers (all against the real TS sources via esbuild bundle):
 *  1. difficulty curve table (depths 1..8)
 *  2. fallback generator validity across themes x depths (incl. cert)
 *  3. validator rejection cases (open border, unreachable pickup, ...)
 *  4. normalizer good/bad mock-AI JSON
 *  5. design loop with stub fetch (invalid -> repair -> valid; always-bad -> throws)
 *  6. scripted playthrough on a fallback level (BFS player vs chasers)
 *  7. --mock-file: validate a pasted model output exactly like the api would
 *  8. --print-prompt: show the exact prompt the model receives
 *  9. sprite membership: only real theme-pack sprites validate; the
 *     preload set covers the prompt vocabulary and every file exists
 *  10. avoidability certificate stats + a trap level that must FAIL
 *  11. solver twin vs game differential (applyAction == resolveTurn/waitTurn)
 *
 *  --live skips the suite and calls a real provider with global fetch:
 *    AI_BASE_URL=http://localhost:11434/v1 AI_API_KEY=ollama \
 *      AI_MODEL=qwen2.5:7b npm run level:lab -- --live [--theme ..] [--depth ..]
 *    (Ollama serves OpenAI-compatible /chat/completions when `ollama serve`
 *    is running — no Vercel, no tunnel, direct from this machine.)
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = require('esbuild');

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => {
    if (!a.startsWith('--')) return [];
    const eq = a.indexOf('=');
    if (eq > 0) return [a.slice(2, eq), a.slice(eq + 1)];
    const next = arr[i + 1];
    if (next && !next.startsWith('--')) return [a.slice(2), next];
    return [a.slice(2), '1'];
  }).filter((x) => x.length),
);
const themeArg = ['dungeon', 'library', 'farm', 'base'].includes(args.theme) ? args.theme : 'dungeon';
const depthArg = Math.min(20, Math.max(1, Number(args.depth) || 2));
const seedArg = Number(args.seed) || 7;

// --- bundle the real sources -------------------------------------------------
const entry = `
export { difficultyFor, ARCHETYPE_BRIEF } from ${JSON.stringify(join(ROOT, 'src', 'level', 'difficulty.ts'))};
export { buildLevelPrompt, buildRepairPrompt } from ${JSON.stringify(join(ROOT, 'src', 'level', 'prompt.ts'))};
export { normalizeAiLevel, extractJson, designLevelWithAi, providerFromEnv } from ${JSON.stringify(join(ROOT, 'src', 'level', 'aiLevel.ts'))};
export { validateLevel, levelWalkability } from ${JSON.stringify(join(ROOT, 'src', 'level', 'validate.ts'))};
export { fallbackLevel } from ${JSON.stringify(join(ROOT, 'src', 'level', 'fallback.ts'))};
export { certifyAvoidable, prepareSolver, applyAction } from ${JSON.stringify(join(ROOT, 'src', 'level', 'solve.ts'))};
export { isKnownSprite, preloadSpritesForTheme, levelTextureKey, CHARACTER_SET, CATALOG_BASES, THEME_CATALOGS } from ${JSON.stringify(join(ROOT, 'src', 'level', 'catalog.ts'))};
export { themeGround, themeWallFor, themeExitSprites } from ${JSON.stringify(join(ROOT, 'src', 'level', 'themeRender.ts'))};
export { bfsNextStep, bfsDistance, floodFill } from ${JSON.stringify(join(ROOT, 'src', 'enemies', 'pathfind.ts'))};
export { TileActor } from ${JSON.stringify(join(ROOT, 'src', 'movement', 'IsoTiles.ts'))};
export { resolveTurn, waitTurn } from ${JSON.stringify(join(ROOT, 'src', 'level', 'turn.ts'))};
`;
const tmpDir = mkdtempSync(join(tmpdir(), 'level-lab-'));
const entryPath = join(tmpDir, 'entry.ts');
writeFileSync(entryPath, entry);
const out = esbuild.buildSync({ entryPoints: [entryPath], bundle: true, format: 'esm', platform: 'node', write: false });
const bundlePath = join(tmpDir, 'lab.bundle.mjs');
writeFileSync(bundlePath, out.outputFiles[0].text);
const L = await import(pathToFileURL(bundlePath).href);

// --live: direct provider call with global fetch (Ollama included), no Vercel.
if (args.live) {
  const provider = L.providerFromEnv(process.env);
  if (!provider) {
    console.error('no AI key: set AI_API_KEY (any value works for Ollama), e.g.');
    console.error('  AI_BASE_URL=http://localhost:11434/v1 AI_API_KEY=ollama AI_MODEL=qwen2.5:7b npm run level:lab -- --live');
    process.exit(1);
  }
  const d = L.difficultyFor(depthArg, themeArg);
  console.log(`live design: ${provider.baseUrl} model=${provider.model} difficulty=${JSON.stringify(d)}`);
  try {
    const r = await L.designLevelWithAi(d, seedArg, provider);
    const v = L.validateLevel(r.level, d.depth);
    const c = L.certifyAvoidable(r.level);
    console.log(`source=ai repaired=${r.repaired} warnings=${JSON.stringify(r.warnings)}`);
    console.log(`validate=${v.ok} cert: len=${c.solutionLength} visited=${c.visited} ms=${c.ms}`);
    console.log(JSON.stringify({ difficulty: d, level: r.level }, null, 1).slice(0, 4000));
    if (args.out) writeFileSync(args.out, JSON.stringify({ difficulty: d, level: r.level }, null, 2));
    process.exit(v.ok && c.ok ? 0 : 1);
  } catch (e) {
    console.error('live design failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

let failures = 0;
let checks = 0;
function check(name, cond, extra = '') {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`);
  }
}

// 1. difficulty curve ----------------------------------------------------------
console.log('1. difficulty curve');
for (const d of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const x = L.difficultyFor(d);
  console.log(`  depth ${d}: ${x.theme} ${x.width}x${x.height} pickups=${x.pickups} chasers=${x.chasers} patrols=${x.patrols} ${x.archetype} par=${x.par}`);
}
check('depth1-budgets', L.difficultyFor(1).pickups === 2 && L.difficultyFor(1).chasers === 1);

// 2. fallback validity ----------------------------------------------------------
console.log('2. fallback validity (themes x depths)');
for (const th of ['dungeon', 'library', 'farm', 'base']) {
  for (const dp of [1, 2, 4, 7, 8]) {
    const lv = L.fallbackLevel({ seed: seedArg, theme: th, depth: dp });
    const v = L.validateLevel(lv, dp);
    check(`${th}/d${dp}`, v.ok, v.errors.slice(0, 2).join('; '));
  }
}

// 3. validator rejects bad maps --------------------------------------------------
console.log('3. validator rejection cases');
const good = L.fallbackLevel({ seed: seedArg, theme: 'dungeon', depth: 1 });
const open = { ...good, tiles: good.tiles.map((r) => `.${r.slice(1, -1)}.`) , id: 'bad-open' };
check('open-border-rejected', !L.validateLevel(open, 1).ok);
const walled = {
  ...good, id: 'bad-unreach',
  tiles: good.tiles.map((r, y) => (y === 0 || y === good.tiles.length - 1 ? r : `#${'#'.repeat(r.length - 2)}#`)),
};
check('unreachable-rejected', !L.validateLevel(walled, 1).ok);
const adj = { ...good, id: 'bad-adj', pickups: [{ id: 'a', x: 2, y: 2, sprite: 'dungeon:chestClosed:S' }, { id: 'b', x: 3, y: 2, sprite: 'dungeon:barrel:S' }] };
check('adjacent-pickups-rejected', L.validateLevel(adj, 1).errors.some((e) => e.includes('adjacent')));
const close = { ...good, id: 'bad-close', enemies: [{ id: 'e', kind: 'chaser', x: good.spawn.x + 1, y: good.spawn.y }] };
check('close-enemy-rejected', L.validateLevel(close, 1).errors.some((e) => e.includes('spawn')));

// 4. normalizer -------------------------------------------------------------------
console.log('4. normalizer (mock AI JSON)');
const mockGood = {
  id: 'm1', theme: 'dungeon',
  tiles: ['#####', '#S..#', '#.#.#', '#..E#', '#####'],
  spawn: { x: 1, y: 1 }, exit: { x: 3, y: 3 },
  pickups: [
    { id: 'k1', x: 3, y: 1, sprite: 'dungeon:chestClosed:S' },
    { id: 'k2', x: 1, y: 3, sprite: 'dungeon:barrel:S' },
  ],
  enemies: [{ id: 'c1', kind: 'chaser', x: 2, y: 1 }],
  props: [],
};
const n1 = L.normalizeAiLevel(mockGood, 1);
check('good-mock-normalizes', n1.issues.length === 0, n1.issues.join('; '));
const n2 = L.normalizeAiLevel({ theme: 'space', tiles: 'nope', pickups: [], enemies: [{ id: 'x', kind: 'dragon', x: 0, y: 0 }], props: '?' }, 1);
check('bad-mock-flagged', n2.issues.length >= 4, n2.issues.join('; '));
const n3 = L.normalizeAiLevel({ ...mockGood, enemies: [{ id: 'p1', kind: 'patrol', x: 2, y: 2 }] }, 1);
check('patrol-without-path-flagged', n3.issues.some((i) => i.includes('path')));

// 5. design loop with stub fetch (no network) ---------------------------------------
console.log('5. design loop (stubbed provider)');
const stubProvider = { baseUrl: 'http://stub', apiKey: 'x', model: 'stub' };
const validPayload = { ...mockGood, tiles: ['#######', '#S....#', '#.###.#', '#.....#', '#.###.#', '#.....#', '####E##'], spawn: { x: 1, y: 1 }, exit: { x: 4, y: 6 }, pickups: [{ id: 'k1', x: 5, y: 1, sprite: 'dungeon:chestClosed:S' }, { id: 'k2', x: 1, y: 5, sprite: 'dungeon:barrel:S' }], enemies: [{ id: 'c1', kind: 'chaser', x: 5, y: 3, tempo: 1 }] };
const openPayload = { ...validPayload, tiles: validPayload.tiles.map((r) => `.${r.slice(1, -1)}.`) };
const stubRepair = async (url, init) => {
  const body = JSON.parse(init.body);
  const last = body.messages[body.messages.length - 1].content;
  // NOTE: match the full repair prefix — the base prompt itself contains
  // the word REJECTED in the escapability constraint.
  const payload = last.includes('Your previous level was REJECTED') ? validPayload : openPayload;
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
};
try {
  const r = await L.designLevelWithAi(L.difficultyFor(1, 'dungeon'), 9, stubProvider, stubRepair);
  check('repair-loop-recovers', r.repaired === true && r.warnings.length > 0);
} catch (e) {
  check('repair-loop-recovers', false, String(e));
}
const stubAlwaysBad = async () =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(openPayload) } }] }), { status: 200 });
try {
  await L.designLevelWithAi(L.difficultyFor(1, 'dungeon'), 9, stubProvider, stubAlwaysBad);
  check('always-bad-throws', false, 'did not throw');
} catch {
  check('always-bad-throws', true);
}

// 6. scripted playthrough ------------------------------------------------------------
// Frozen mode (enemies pinned) PROVES static solvability and is asserted.
// Live mode is informational: greedy shortest-path play is not optimal play,
// it only shows whether chasers dominate the board.
console.log('6. playthrough (depth 1..3: frozen=asserted, live=reported)');
function play(dp, freeze) {
  const lv = L.fallbackLevel({ seed: seedArg, theme: 'dungeon', depth: dp });
  const { isWalkable, width, height } = L.levelWalkability(lv);
  const st = {
    player: new L.TileActor({ ...lv.spawn }),
    // frozen = no enemy actors at all: proves the static layout (movement +
    // pickup routing + exit gating) is solvable through resolveTurn itself.
    enemies: freeze ? [] : lv.enemies.map((e) => ({ id: e.id, kind: e.kind, actor: new L.TileActor({ x: e.x, y: e.y }), tempo: e.tempo ?? 1 })),
    isWalkable, width, height,
    pickups: new Map(lv.pickups.map((p) => [p.id, { x: p.x, y: p.y }])),
    exit: { ...lv.exit },
    turn: 0,
  };
  let outcome = 'timeout';
  for (let t = 0; t < 400; t++) {
    const targets = st.pickups.size > 0 ? [...st.pickups.values()] : [st.exit];
    let best = null;
    for (const tg of targets) {
      const s = L.bfsNextStep(isWalkable, width, height, st.player.tile, tg, (x) =>
        !freeze && st.enemies.some((e) => e.actor.tile.x === x.x && e.actor.tile.y === x.y));
      if (s) { best = s; break; }
    }
    if (!best) { outcome = st.pickups.size === 0 ? 'exit-blocked' : 'pickup-blocked'; break; }
    const r = L.resolveTurn(st, best.x - st.player.tile.x, best.y - st.player.tile.y);
    if (r.kind !== 'moved') { outcome = `stuck-${r.kind}`; break; }
    if (r.died) { outcome = `died@${t + 1}`; break; }
    if (r.exited) { outcome = `exited@${t + 1}`; break; }
  }
  return outcome;
}
for (const dp of [1, 2, 3]) {
  const frozen = play(dp, true);
  const live = play(dp, false);
  console.log(`  depth ${dp}: frozen=${frozen} live=${live}`);
  check(`solvable-d${dp}`, frozen.startsWith('exited'), frozen);
}

// 9. sprite membership: real packs only --------------------------------------------
console.log('9. sprite membership (real theme packs only)');
check('catalog-nonempty', L.CATALOG_BASES.length > 60, String(L.CATALOG_BASES.length));
check(
  'known-accepts-catalog',
  L.CATALOG_BASES.every((s) => L.isKnownSprite(`${s}:S`)),
);
for (const bad of ['crate', 'wall:N', 'dungeon:nope:S', 'space:chest:S', '']) {
  check(`unknown-rejects-${bad || 'empty'}`, !L.isKnownSprite(bad));
}
for (const th of ['dungeon', 'library', 'farm', 'base']) {
  const pre = L.preloadSpritesForTheme(th, 'lvl');
  const missing = pre.filter((p) => !existsSync(join(ROOT, 'public', p.file)));
  check(`preload-${th}-files-exist (${pre.length})`, missing.length === 0, missing.slice(0, 3).map((p) => p.file).join('; '));
}
const protoLevel = { ...good, id: 'bad-proto-sprite', pickups: [{ id: 'k', x: 2, y: 2, sprite: 'crate' }, { id: 'k2', x: 5, y: 5, sprite: 'dungeon:barrel:S' }] };
check(
  'prototype-sprite-rejected',
  L.validateLevel(protoLevel, 1).errors.some((e) => e.includes('unknown sprite')),
);
const mixedLevel = { ...good, id: 'bad-mixed-pack', pickups: [{ id: 'k', x: 2, y: 2, sprite: 'farm:corn:S' }, { id: 'k2', x: 5, y: 5, sprite: 'dungeon:barrel:S' }] };
check(
  'mixed-pack-rejected',
  L.validateLevel(mixedLevel, 1).errors.some((e) => e.includes('must match the room theme')),
);

// 10. avoidability certificate --------------------------------------------------------
console.log('10. avoidability certificate');
for (const dp of [1, 2, 4, 7, 8]) {
  const lv = L.fallbackLevel({ seed: seedArg, theme: 'dungeon', depth: dp });
  const c = L.certifyAvoidable(lv);
  console.log(`  dungeon d${dp}: ok=${c.ok} len=${c.solutionLength} visited=${c.visited} ms=${c.ms}`);
  check(`cert-d${dp}`, c.ok, c.reason);
}
// trap: the ONLY crossing is a 1-wide tunnel with a tempo-1 chaser inside.
// Flood-fill passes, budgets pass — only the solver can reject it.
const trap = {
  id: 'trap-tunnel',
  theme: 'dungeon',
  tiles: [
    '###########',
    '#S..###...#',
    '#...###...#',
    '#.........#',
    '#...###...#',
    '#...###...#',
    '########E##',
  ],
  spawn: { x: 1, y: 1 },
  exit: { x: 8, y: 6 },
  pickups: [
    { id: 'k1', x: 1, y: 5, sprite: 'dungeon:barrel:S' },
    { id: 'k2', x: 9, y: 1, sprite: 'dungeon:chestClosed:S' },
  ],
  enemies: [{ id: 'c1', kind: 'chaser', x: 5, y: 3, tempo: 1 }],
  props: [],
};
const trapStatic = L.validateLevel({ ...trap, enemies: [] }, 1);
check(
  'trap-layout-sound-without-enemy',
  !trapStatic.ok && trapStatic.errors.length === 1 && trapStatic.errors[0].includes('at least 1 chaser'),
  trapStatic.errors.slice(0, 3).join('; '),
);
const trapCert = L.certifyAvoidable(trap);
console.log(`  trap: ok=${trapCert.ok} visited=${trapCert.visited} ms=${trapCert.ms} (${trapCert.reason})`);
check('trap-rejected-by-cert', !trapCert.ok, trapCert.reason);
check(
  'trap-rejected-by-validate',
  L.validateLevel(trap, 1).errors.some((e) => e.includes('no escape path') || e.includes('uncertified')),
);

// 11. solver twin vs game (differential) ------------------------------------------------
console.log('11. solver twin vs game (applyAction == resolveTurn/waitTurn)');
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, 'wait'];
let diffSteps = 0;
for (const dp of [1, 2, 4]) {
  const lv = L.fallbackLevel({ seed: seedArg + dp, theme: 'dungeon', depth: dp });
  const { isWalkable, width, height } = L.levelWalkability(lv);
  const gst = {
    player: new L.TileActor({ ...lv.spawn }),
    enemies: lv.enemies.map((e) => ({
      id: e.id, kind: e.kind, actor: new L.TileActor({ x: e.x, y: e.y }),
      path: e.path?.map((t) => ({ ...t })), pathIdx: 0, tempo: e.tempo ?? 1,
    })),
    isWalkable, width, height,
    pickups: new Map(lv.pickups.map((p) => [p.id, { x: p.x, y: p.y }])),
    exit: { ...lv.exit },
    turn: 0,
  };
  const slv = L.prepareSolver(lv);
  let sst = {
    player: { ...lv.spawn },
    enemies: slv.enemies.map((e) => ({ ...e, pos: { ...e.pos }, path: e.path.map((t) => ({ ...t })) })),
    mask: (1 << slv.pickups.length) - 1,
    turn: 0,
  };
  const rnd = mulberry(seedArg * 31 + dp);
  let ok = true;
  let why = '';
  for (let i = 0; i < 80 && ok; i++) {
    const a = DIRS[Math.floor(rnd() * DIRS.length)];
    const gr = a === 'wait' ? L.waitTurn(gst) : L.resolveTurn(gst, a.dx, a.dy);
    const sr = L.applyAction(slv, sst, a);
    if ((gr.kind === 'moved') !== sr.ok) { ok = false; why = `validity@${i}`; break; }
    if (!sr.ok || !sr.state) { diffSteps += 1; continue; }
    const samePos = gr.to.x === sr.state.player.x && gr.to.y === sr.state.player.y;
    const sameDeath = gr.died === sr.died;
    const sameExit = gr.exited === sr.exited;
    const samePick = gst.pickups.size === slv.pickups.filter((_, b) => sr.state.mask & (1 << b)).length;
    const sameEnemies = gst.enemies.every((e, j) => e.actor.tile.x === sr.state.enemies[j].pos.x && e.actor.tile.y === sr.state.enemies[j].pos.y);
    if (!(samePos && sameDeath && sameExit && samePick && sameEnemies)) {
      ok = false;
      why = `diverge@${i} pos=${samePos} death=${sameDeath} exit=${sameExit} pick=${samePick} enemies=${sameEnemies}`;
      break;
    }
    diffSteps += 1;
    sst = sr.state;
    if (gr.died || gr.exited) break;
  }
  check(`twin-d${dp}`, ok, why);
}
console.log(`  compared ${diffSteps} transitions`);

// 12. theme render map: every key the scene requests must preload + exist -----
console.log('12. theme render map (scene keys resolve to real files)');
// The scene preloads ALL themes, so cross-pack ground/corners resolve too.
const preAll = new Map();
for (const th of ['dungeon', 'library', 'farm', 'base']) {
  for (const p of L.preloadSpritesForTheme(th, `lvl_${th}`)) preAll.set(p.key, p.file);
}
for (const th of ['dungeon', 'library', 'farm', 'base']) {
  const pre = preAll;
  const need = [];
  need.push(L.themeGround(th));
  // wall orientations on a plus-shaped fixture
  const isWall = (x, y) => x === 1 && y >= 0 && y <= 2 ? true : y === 1 && x >= 0 && x <= 2;
  need.push(L.themeWallFor(th, 1, 1, isWall));
  need.push(L.themeWallFor(th, 0, 1, isWall));
  need.push(L.themeWallFor(th, 1, 0, isWall));
  const ex = L.themeExitSprites(th);
  need.push(ex.closed, ex.open);
  let okIds = true;
  let okKeys = true;
  const missingFiles = [];
  for (const id of need) {
    const m = id.match(/^(dungeon|library|farm|base):([^:]+):([NESW])$/);
    if (!m || !L.isKnownSprite(id)) { okIds = false; break; }
    const key = L.levelTextureKey(m[1], m[2], m[3]);
    const file = pre.get(key);
    if (!file) { okKeys = false; break; }
    if (!existsSync(join(ROOT, 'public', file))) missingFiles.push(file);
  }
  check(`render-${th}-ids-known`, okIds, need.join(' '));
  check(`render-${th}-keys-preloaded`, okKeys);
  check(`render-${th}-files-exist`, missingFiles.length === 0, missingFiles.slice(0, 2).join('; '));
  // a real fallback level's pickups/props resolve too
  const lv = L.fallbackLevel({ seed: seedArg, theme: th, depth: 2 });
  const sprites = [...lv.pickups.map((p) => p.sprite), ...lv.props.map((p) => p.sprite)];
  check(
    `render-${th}-level-sprites-resolve`,
    sprites.every((s) => {
      const m = s.match(/^(dungeon|library|farm|base):([^:]+):([NESW])$/);
      return m !== null && pre.has(L.levelTextureKey(m[1], m[2], m[3]));
    }),
    sprites.join(' '),
  );
}
for (const d of L.CHARACTER_SET.facings) {
  const idle = `dungeon_sprites/Characters/Male/Male_${d}_Idle0.png`;
  const run5 = `dungeon_sprites/Characters/Male/Male_${d}_Run5.png`;
  if (!existsSync(join(ROOT, 'public', idle)) || !existsSync(join(ROOT, 'public', run5))) {
    check(`render-male-${d}-files`, false, idle);
  }
}
check('render-male-files', true);

// 13. wall connection rules -----------------------------------------------------------
console.log('13. wall connection rules');
const run = (fn) => (x, y) => fn(x, y);
check('wall-straight-x', L.themeWallFor('dungeon', 1, 1, run((x, y) => y === 1 && x >= 0 && x <= 2)) === 'dungeon:stoneWall:S');
check('wall-straight-y', L.themeWallFor('dungeon', 1, 1, run((x, y) => x === 1 && y >= 0 && y <= 2)) === 'dungeon:stoneWall:W');
// Lean-matched corners: (es/wn->S tower, sw/ne->W block); E chips the
// skyline and N dents below run tops, so neither is used on L-turns.
check('wall-corner-es', L.themeWallFor('dungeon', 1, 1, run((x, y) => (x === 2 && y === 1) || (x === 1 && y === 2) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:S');
check('wall-corner-sw', L.themeWallFor('dungeon', 1, 1, run((x, y) => (x === 1 && y === 2) || (x === 0 && y === 1) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:W');
check('wall-corner-wn', L.themeWallFor('dungeon', 1, 1, run((x, y) => (x === 0 && y === 1) || (x === 1 && y === 0) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:S');
check('wall-corner-ne', L.themeWallFor('dungeon', 1, 1, run((x, y) => (x === 1 && y === 0) || (x === 2 && y === 1) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:W');
// 180-degree pairs share convex art: E/W corner sprites are concave
// (reflex) pieces and never render on convex corners (verified in renders).
check('wall-corner-farm-es', L.themeWallFor('farm', 1, 1, run((x, y) => (x === 2 && y === 1) || (x === 1 && y === 2) || (x === 1 && y === 1))) === 'farm:woodWall:W');
check('wall-corner-farm-sw', L.themeWallFor('farm', 1, 1, run((x, y) => (x === 1 && y === 2) || (x === 0 && y === 1) || (x === 1 && y === 1))) === 'farm:woodWall:W');
check('wall-corner-farm-wn', L.themeWallFor('farm', 1, 1, run((x, y) => (x === 0 && y === 1) || (x === 1 && y === 0) || (x === 1 && y === 1))) === 'farm:woodWall:W');
check('wall-corner-farm-ne', L.themeWallFor('farm', 1, 1, run((x, y) => (x === 1 && y === 0) || (x === 2 && y === 1) || (x === 1 && y === 1))) === 'farm:woodWall:W');
check('wall-corner-library-sw', L.themeWallFor('library', 1, 1, run((x, y) => (x === 1 && y === 2) || (x === 0 && y === 1) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:W');
check('wall-corner-library-wn', L.themeWallFor('library', 1, 1, run((x, y) => (x === 0 && y === 1) || (x === 1 && y === 0) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:S');
check('wall-corner-library-ne', L.themeWallFor('library', 1, 1, run((x, y) => (x === 1 && y === 0) || (x === 2 && y === 1) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:W');
check('wall-tee-runs-through', L.themeWallFor('dungeon', 1, 1, run((x, y) => (y === 1 && x >= 0 && x <= 2) || (x === 1 && y === 2))) === 'dungeon:stoneWall:S');
check('wall-isolated-dungeon', L.themeWallFor('dungeon', 3, 3, () => false) === 'dungeon:stoneColumn:S');
check('wall-isolated-farm', L.themeWallFor('farm', 3, 3, () => false) === 'farm:woodWallSupport:S');
check('wall-isolated-library', L.themeWallFor('library', 3, 3, () => false) === 'library:wallBooks:S');
check('wall-isolated-base', L.themeWallFor('base', 3, 3, () => false) === 'base:square_stone_high:S');
check('wall-straight-y-library', L.themeWallFor('library', 1, 1, run((x, y) => x === 1 && y >= 0 && y <= 2)) === 'library:wallBooks:E');
check('wall-library-bottom-low', L.themeWallFor('library', 2, 4, run((x, y) => y === 4 && x >= 1 && x <= 3), 'N') === 'library:bookcaseHalfBooks:S');
check('wall-library-right-low', L.themeWallFor('library', 4, 2, run((x, y) => x === 4 && y >= 1 && y <= 3), 'W') === 'library:bookcaseHalfBooks:E');
check('wall-library-top-tall', L.themeWallFor('library', 2, 0, run((x, y) => y === 0 && x >= 1 && x <= 3), 'S') === 'library:wallBooks:S');
check('wall-library-left-tall', L.themeWallFor('library', 0, 2, run((x, y) => x === 0 && y >= 1 && y <= 3), 'E') === 'library:wallBooks:E');
check('wall-dungeon-bottom-tall', L.themeWallFor('dungeon', 2, 4, run((x, y) => y === 4 && x >= 1 && x <= 3), 'N') === 'dungeon:stoneWall:S');
check('wall-corner-library-stone', L.themeWallFor('library', 1, 1, run((x, y) => (x === 2 && y === 1) || (x === 1 && y === 2) || (x === 1 && y === 1))) === 'dungeon:stoneWallCorner:S');
check('library-ground-crosspack', L.themeGround('library') === 'dungeon:planks:S');
check('base-ground-square', L.themeGround('base') === 'base:square_grass_flat:S');
// validator: lone pillar + 2-stub rejected, border buttress accepted
function withWalls(base, walls) {
  const rows = base.tiles.map((r) => r.split(''));
  for (const [x, y] of walls) rows[y][x] = '#';
  return { ...base, tiles: rows.map((r) => r.join('')) };
}
function freeTiles(lv, n, isolated = false) {
  const taken = new Set([`${lv.spawn.x},${lv.spawn.y}`, `${lv.exit.x},${lv.exit.y}`, ...lv.pickups.map((p) => `${p.x},${p.y}`), ...lv.enemies.map((e) => `${e.x},${e.y}`), ...lv.props.flatMap((p) => p.footprint.map((t) => `${t.x},${t.y}`))]);
  const out = [];
  lv.tiles.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.' || taken.has(`${x},${y}`) || x <= 0 || y <= 0 || x >= row.length - 1 || y >= lv.tiles.length - 1) return;
    if (isolated) {
      const wallN = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => lv.tiles[y + dy]?.[x + dx] === '#');
      if (wallN) return;
    }
    out.push([x, y]);
  }));
  return out.slice(0, n);
}
const pillarLvl = withWalls(good, [freeTiles(good, 1, true)[0]]);
check(
  'lone-pillar-rejected',
  L.validateLevel({ ...pillarLvl, id: 'bad-pillar' }, 1).errors.some((e) => e.includes('free-floating')),
);
const stubTiles = freeTiles(good, 8, true);
const stubA = stubTiles.find(([x, y]) => stubTiles.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) === 1));
const stubB = stubTiles.find(([a, b]) => Math.abs(a - stubA[0]) + Math.abs(b - stubA[1]) === 1);
const stubLvl = withWalls(good, [stubA, stubB]);
check(
  'two-stub-rejected',
  L.validateLevel({ ...stubLvl, id: 'bad-stub' }, 1).errors.some((e) => e.includes('free-floating')),
);
// buttress: interior tile adjacent to the border ring
const edge = freeTiles(good, 40).find(([x, y]) => x === 1 || y === 1 || x === good.tiles[0].length - 2 || y === good.tiles.length - 2);
if (edge) {
  const buttress = withWalls(good, [edge]);
  const v = L.validateLevel({ ...buttress, id: 'ok-buttress' }, 1);
  check('border-buttress-accepted', v.ok, v.errors.slice(0, 2).join('; '));
} else check('border-buttress-accepted', false, 'no edge tile found');

// 7 + 8. mock file + prompt ------------------------------------------------------------
if (args['mock-file']) {
  console.log('7. mock file');
  const raw = JSON.parse(readFileSync(args['mock-file'], 'utf8'));
  const n = L.normalizeAiLevel(raw, seedArg);
  console.log('  normalize issues:', n.issues.length ? n.issues : '(none)');
  if (n.issues.length === 0) {
    const v = L.validateLevel(n.level, depthArg);
    console.log('  validate:', v.ok ? 'OK' : v.errors);
    check('mock-file-valid', v.ok, v.errors.slice(0, 3).join('; '));
  } else check('mock-file-valid', false, n.issues.slice(0, 3).join('; '));
}
if (args['print-prompt']) {
  const d = L.difficultyFor(depthArg, themeArg);
  const p = L.buildLevelPrompt(d, seedArg);
  console.log('8. prompt for', JSON.stringify(d));
  console.log('--- system ---\n' + p.system + '\n--- user ---\n' + p.user);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
