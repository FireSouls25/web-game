/**
 * Real-pack theme preview — software iso compositor (ImageMagick) that
 * mirrors LevelScene.loadLevel with REAL theme-pack art, so wall rules,
 * grounds, doors, props and characters can be checked without booting.
 *
 * Usage:
 *   node scripts/theme-preview.mjs <theme> <out.png> [options]
 *
 * Options (argv --key=value):
 *   --room=WxH            border room + south exit (default 9x7)
 *   --room-json=path      {tiles:[...]} room instead of generated border
 *   --fallback=seed,depth[,W,H]
 *                         render a real fallbackLevel (props/pickups/enemies)
 *   --door=open|closed    exit state (default closed)
 *   --walls=auto|doc      wall system: src themeWallFor | legacy doc copy
 *                         (doc should match auto; cross-check only)
 *   --rugs                experiment: carpet runner overlay (NOT in game)
 *   --depth=scene|flat    depth emulation: scene (-2 grounds, the old bug)
 *                         | flat (-1000 grounds, like the game today)
 *   --noactors            skip demo prop + character (rooms only)
 *
 * Paint order emulates Phaser depth: jobs carry depthFor(x, y, layer) with
 * the game's layers (ground / wall 0.15 / prop 0.12 / pickup+exit 0.18 /
 * actor 0.2) and are composited back-to-front. Rugs share the ground layer
 * (painted after grounds, like same-depth add order in Phaser).
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME_ISO = {
  dungeon: join(ROOT, 'public/dungeon_sprites/Isometric'),
  library: join(ROOT, 'public/library_sprites/Isometric'),
  farm: join(ROOT, 'public/farm_sprites/Isometric'),
  base: join(ROOT, 'public/base_sprites/Isometric'),
};
const CHAR_DIR = join(ROOT, 'public/dungeon_sprites/Characters/Male');

const TW = 256;
const TH = 128;
const pos = (x, y) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) });
const depthFor = (x, y, layer = 0) => (x + y) * 10 + layer;
// Game layers mirrored from LevelScene.put calls.
const LAYER = { ground: -2, groundFlat: -1000, prop: 0.12, wall: 0.15, exit: 0.18, actor: 0.2 };

function parseSprite(sprite) {
  const parts = sprite.split(':');
  if (parts.length === 2 && THEME_ISO[parts[0]]) return { pack: parts[0], base: parts[1], dir: 'S' };
  if (parts.length === 1) return { pack: null, base: sprite, dir: 'S' };
  return { pack: THEME_ISO[parts[0]] ? parts[0] : null, base: parts[1], dir: (parts[2] || 'S').toUpperCase() };
}
function imgFor(base, dir, pack) {
  return join((pack && THEME_ISO[pack]) || THEME_ISO.dungeon, `${base}_${dir}.png`);
}
// ---------------------------------------------------------------------------
// Diagnosis-doc (Fix 1) wall system, implemented here for A/B comparison.
// Same signature as themeWallFor. Border-specific facings (outer edge per
// border), arm-matched corners, :N doors.
// ---------------------------------------------------------------------------
const DOC_PILLAR = { dungeon: 'stoneColumn', library: 'wallBooks', farm: 'woodWallSupport', base: 'square_stone_high' };
const DOC_BASE = { dungeon: 'stoneWall', library: 'wallBooks', farm: 'woodWall', base: 'square_stone_high' };
function docWallFor(theme, x, y, isWall, interior) {
  const n = isWall(x, y - 1);
  const s = isWall(x, y + 1);
  const e = isWall(x + 1, y);
  const w = isWall(x - 1, y);
  const count = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
  if (count === 0) return `${theme}:${DOC_PILLAR[theme]}:S`;
  const base = DOC_BASE[theme];
  const packFor = (b) => (theme === 'library' && (b === 'stoneWallCorner')) ? 'dungeon' : theme;
  const xRun = () => {
    if (theme === 'library' && interior === 'N') return 'library:wallBooks:N';
    if (interior === 'N') return `${theme}:${base}:N`;
    return `${theme}:${base}:S`;
  };
  const yRun = () => {
    if (theme === 'library' && interior === 'W') return 'library:wallBooks:W';
    if (interior === 'W') return `${theme}:${base}:W`;
    return `${theme}:${base}:E`;
  };
  const alongX = e || w;
  const alongY = n || s;
  if (alongX && !alongY) return xRun();
  if (alongY && !alongX) return yRun();
  if (count === 2) {
    if (theme === 'farm') {
      // No L-block: both edge panels (LevelScene renders arrays).
      if (e && s) return 'farm:woodWall:E+farm:woodWall:S';
      if (s && w) return 'farm:woodWall:S+farm:woodWall:W';
      if (n && e) return 'farm:woodWall:E+farm:woodWall:N';
      return 'farm:woodWall:W+farm:woodWall:N'; // w && n
    }
    const cornerBase = 'stoneWallCorner';
    const pk = packFor(cornerBase);
    if (e && s) return `${pk}:${cornerBase}:S`;
    if (s && w) return `${pk}:${cornerBase}:W`;
    if (n && e) return `${pk}:${cornerBase}:E`;
    return `${pk}:${cornerBase}:N`; // w && n
  }
  return e && w ? xRun() : yRun();
}
function docExitClosed(theme) {
  switch (theme) {
    case 'dungeon': return 'dungeon:stoneWallDoorClosed:N';
    case 'farm': return 'farm:woodWallDoorClosed:N';
    case 'library': return 'library:wallDoorway:N';
    case 'base': return 'base:square_stone_high:S';
  }
}

const DEMO_PROPS = {
  dungeon: 'dungeon:woodenCrate:S',
  library: 'library:bookStand:S',
  farm: 'farm:hayBales:S',
  base: 'base:square_wood_high:S',
};

async function main() {
  const [themeArg, outPath, ...rest] = process.argv.slice(2);
  if (!themeArg || !outPath || !THEME_ISO[themeArg]) {
    console.error('usage: node scripts/theme-preview.mjs <dungeon|library|farm|base> <out.png> [--key=value ...]');
    process.exit(1);
  }
  const theme = themeArg;
  const opt = {};
  for (const r of rest) {
    const m = r.match(/^--([^=]+)(=(.*))?$/);
    if (m) opt[m[1]] = m[3] ?? '1';
  }
  const wallsMode = opt.walls || 'auto';
  const doorOpen = (opt.door || 'closed') === 'open';
  const groundLayer = (opt.depth || 'scene') === 'flat' ? LAYER.groundFlat : LAYER.ground;

  // Bundle the real sources (themeWallFor + fallbackLevel).
  const esbuild = require('esbuild');
  const entry = join(mkdtempSync(join(tmpdir(), 'theme-preview-entry-')), 'entry.mjs');
  writeFileSync(
    entry,
    `export * as TR from ${JSON.stringify(join(ROOT, 'src/level/themeRender.ts'))};\n` +
    `export * as FB from ${JSON.stringify(join(ROOT, 'src/level/fallback.ts'))};\n`,
  );
  const out = esbuild.buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false });
  const tmpDir = mkdtempSync(join(tmpdir(), 'theme-preview-'));
  const bundlePath = join(tmpDir, 'bundle.mjs');
  writeFileSync(bundlePath, out.outputFiles[0].text);
  const mod = await import(pathToFileURL(bundlePath).href);
  const { TR } = mod;

  // Level data: fallback / room-json / generated border room.
  let level;
  if (opt.fallback) {
    const [seed, depth, w, h] = opt.fallback.split(',').map(Number);
    level = mod.FB.fallbackLevel({ seed: seed || 1, theme, depth: depth || 1, width: w, height: h });
  } else if (opt['room-json']) {
    const room = JSON.parse(readFileSync(opt['room-json'], 'utf8'));
    const tiles = room.tiles;
    const H = tiles.length, W = tiles[0].length;
    const find = (ch) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tiles[y][x] === ch) return { x, y };
      return { x: 1, y: 1 };
    };
    level = {
      id: 'custom', theme, tiles,
      spawn: find('S'), exit: find('E'),
      pickups: [], enemies: [], props: room.props ?? [],
    };
  } else {
    const [w = 9, h = 7] = (opt.room || '9x7').split('x').map(Number);
    const W = w, H = h;
    const tiles = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) row += (y === 0 || x === 0 || x === W - 1 || y === H - 1) ? '#' : '.';
      tiles.push(row);
    }
    const ex = W - 3;
    tiles[H - 1] = tiles[H - 1].slice(0, ex) + 'E' + tiles[H - 1].slice(ex + 1);
    level = { id: 'border', theme, tiles, spawn: { x: 1, y: 1 }, exit: { x: ex, y: H - 1 }, pickups: [], enemies: [], props: [] };
  }
  const tiles = level.tiles;
  const H = tiles.length, W = tiles[0].length;
  const isWall = (x, y) => {
    const ch = tiles[y]?.[x];
    return ch === '#' || ch === 'E';
  };
  const interiorOf = (x, y) => {
    if (x === 0) return 'E';
    if (x === W - 1) return 'W';
    if (y === 0) return 'S';
    if (y === H - 1) return 'N';
    return undefined;
  };
  // --corner-pair=es:id1+id2,sw:... overrides L-corner tiles in auto mode
  // (multi-sprite joints, e.g. farm paired panels).
  const pairMap = {};
  if (opt['corner-pair']) {
    for (const kv of String(opt['corner-pair']).split(',')) {
      const i = kv.indexOf(':');
      if (i > 0) pairMap[kv.slice(0, i)] = kv.slice(i + 1);
    }
  }
  const armPairOf = (x, y) => {
    const n = isWall(x, y - 1), s = isWall(x, y + 1), e = isWall(x + 1, y), w = isWall(x - 1, y);
    const c = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
    if (c !== 2) return null;
    if (e && s) return 'es';
    if (s && w) return 'sw';
    if (w && n) return 'wn';
    if (n && e) return 'ne';
    return null;
  };
  const wallFor = (x, y) => {
    if (wallsMode === 'doc') return docWallFor(theme, x, y, isWall, interiorOf(x, y));
    const wid = TR.themeWallFor(theme, x, y, isWall, interiorOf(x, y));
    if (Object.keys(pairMap).length > 0) {
      const a = armPairOf(x, y);
      if (a && pairMap[a]) return pairMap[a];
    }
    return wid;
  };

  const jobs = [];
  const push = (img, x, y, layer) => {
    const { sx, sy } = pos(x, y);
    // Image bottom-center anchors at (sx, sy + TH/2), like Phaser origin(0.5,1).
    jobs.push({ img, x: sx, y: sy, layer, depth: depthFor(x, y, layer) });
  };
  // Mirror of LevelScene.loadLevel ground passes (substrate + variety).
  const substrateId = TR.themeSubstrate(theme);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = tiles[y][x];
      // Game behavior: ground under every tile, walls included.
      if (substrateId) {
        const sp = parseSprite(substrateId);
        push(imgFor(sp.base, sp.dir, sp.pack), x, y, groundLayer);
      }
      const gp = parseSprite(TR.themeGroundFor(theme, x, y));
      push(imgFor(gp.base, gp.dir, gp.pack), x, y, groundLayer);
      if (ch === '#') {
        const wid = wallFor(x, y);
        for (const one of wid.split('+')) {
          const p = parseSprite(one);
          push(imgFor(p.base, p.dir, p.pack), x, y, LAYER.wall);
        }
      } else if (ch === 'E') {
        const ex = doorOpen ? TR.themeExitSprites(theme).open : TR.themeExitSprites(theme).closed;
        const id = wallsMode === 'doc' && !doorOpen ? docExitClosed(theme) : ex;
        const p = parseSprite(id);
        push(imgFor(p.base, p.dir, p.pack), x, y, LAYER.exit);
        // Exit landing doorstep (always in game): ground outside the door.
        const lddx = level.exit.x === 0 ? -1 : level.exit.x === W - 1 ? 1 : 0;
        const lddy = level.exit.y === 0 ? -1 : level.exit.y === H - 1 ? 1 : 0;
        if (lddx !== 0 || lddy !== 0) {
          if (substrateId) {
            const sp = parseSprite(substrateId);
            push(imgFor(sp.base, sp.dir, sp.pack), level.exit.x + lddx, level.exit.y + lddy, groundLayer);
          }
          const lp = parseSprite(TR.themeGroundFor(theme, level.exit.x, level.exit.y));
          push(imgFor(lp.base, lp.dir, lp.pack), level.exit.x + lddx, level.exit.y + lddy, groundLayer);
        }
      }
    }
  }
  // Library carpet runners: ambient decor row (non-blocking, rides ground layer).
  if (opt.rugs && theme === 'library') {
    const ry = Math.floor(H / 2);
    for (let x = 2; x <= W - 3; x++) {
      const rug = (x === 2 || x === W - 3) ? 'library:floorCarpetSmall:S' : 'library:floorCarpet:S';
      const p = parseSprite(rug);
      push(imgFor(p.base, p.dir, p.pack), x, ry, groundLayer);
    }
  }
  if (opt.noactors === undefined) {
    for (const pr of level.props) {
      const p = parseSprite(pr.sprite);
      push(imgFor(p.base, p.dir, p.pack), pr.anchor.x, pr.anchor.y, LAYER.prop);
    }
    for (const pk of level.pickups) {
      const p = parseSprite(pk.sprite);
      push(imgFor(p.base, p.dir, p.pack), pk.x, pk.y, LAYER.exit);
    }
    if (!opt['room-json'] || level.props.length > 0 || true) {
      if (level.props.length === 0 && level.pickups.length === 0) {
        const pp = parseSprite(DEMO_PROPS[theme]);
        push(imgFor(pp.base, pp.dir, pp.pack), Math.min(3, W - 2), Math.min(3, H - 2), LAYER.prop);
      }
    }
    push(join(CHAR_DIR, 'Male_4_Idle0.png'), level.spawn.x, level.spawn.y, LAYER.actor);
    for (const e of level.enemies) {
      push(join(CHAR_DIR, 'Male_4_Idle0.png'), e.x, e.y, LAYER.actor);
    }
  }

  // Depth-sorted paint (stable: same-depth keeps insertion order, like Phaser).
  const indexed = jobs.map((j, i) => ({ ...j, i })).sort((a, b) => a.depth - b.depth || a.i - b.i);
  const minSx = Math.min(...indexed.map((j) => j.x)) - TW / 2;
  const maxSx = Math.max(...indexed.map((j) => j.x)) + TW / 2;
  const minSy = -512 - TH / 2;
  const maxSy = Math.max(...indexed.map((j) => j.y)) + TH / 2;
  const CW = Math.ceil(maxSx - minSx), CH = Math.ceil(maxSy - minSy);
  const args = ['-size', `${CW}x${CH}`, 'xc:#1a1426'];
  for (const j of indexed) {
    args.push(j.img, '-geometry', `+${Math.round(j.x - minSx - TW / 2)}+${Math.round(j.y - minSy + TH / 2 - 512)}`, '-composite');
  }
  args.push(outPath);
  execFileSync('magick', args, { stdio: 'inherit' });
  console.log(`wrote ${outPath} (${CW}x${CH}, ${jobs.length} sprites)`);
  rmSync(tmpDir, { recursive: true, force: true });
}

await main();
