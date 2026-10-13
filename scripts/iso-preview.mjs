/**
 * DEV-ONLY preview renderer — software iso compositor (ImageMagick) that
 * mirrors GameScene.renderRoom so wall variants / room layouts can be
 * checked without booting the game.
 *
 * Usage:
 *   node scripts/iso-preview.mjs <room.json> <out.png> [theme]
 *
 * room.json: { "tiles": [...ascii...], "props": [{sprite:"wall:N",x,y}] }
 * Sprite ids use the same "base" / "base:DIR" convention as RoomProp.
 * With a theme (dungeon|library|farm|base), pack-qualified prop sprites
 * ("dungeon:chestClosed:S") resolve into that pack and floor tiles use
 * the theme ground; wall/door/stair autotile still renders prototype art
 * in both modes (layout checker, not a beauty render — in-game themes
 * render through GameScene's real-pack preload).
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ISO = join(ROOT, 'public/prototype_sprites/Isometric');
const THEME_ISO = {
  dungeon: join(ROOT, 'public/dungeon_sprites/Isometric'),
  library: join(ROOT, 'public/library_sprites/Isometric'),
  farm: join(ROOT, 'public/farm_sprites/Isometric'),
  base: join(ROOT, 'public/base_sprites/Isometric'),
};
// Must match themeGround() in src/level/themeRender.ts: library has no usable
// floor of its own (floorCarpet* are floating rugs), so it uses dungeon
// dark planks; base uses square platforms (round tiles leave corner gaps).
const THEME_GROUND = {
  dungeon: ['dungeon', 'stone'],
  library: ['dungeon', 'planks'],
  farm: ['farm', 'dirt'],
  base: ['base', 'square_grass_flat'],
};

const TW = 256; // native diamond footprint
const TH = 128;

/**
 * Tile -> native-pixel ground-center. Exported for scripts/check-projection.mjs
 * so the preview's placement math can be asserted against IsoTiles'
 * makeProjection(256). tileToScreen (same formula, one spelling each side).
 */
export function previewTileToScreen(x, y) {
  return { sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) };
}

function parseSprite(sprite) {
  const parts = sprite.split(':');
  if (parts.length === 1) return { pack: null, base: sprite, dir: 'S' };
  if (parts.length === 2) {
    // "pack:base" (= S facing) or legacy "base:DIR" — a real pack name disambiguates.
    if (THEME_ISO[parts[0]]) return { pack: parts[0], base: parts[1], dir: 'S' };
    return { pack: null, base: parts[0], dir: parts[1].toUpperCase() };
  }
  return { pack: THEME_ISO[parts[0]] ? parts[0] : null, base: parts[1], dir: parts[2].toUpperCase() };
}

function imgFor(base, dir, pack) {
  const root = (pack && THEME_ISO[pack]) || ISO;
  return join(root, `${base}_${dir}.png`);
}

// --- wall autotile v1 (MUST match wallVariantFor in GameScene.ts) ---
// Back edges (interior to the SE: south of x-runs, east of y-runs) render
// full height — the pack's "top walls". Front edges render LOW
// (wallHalf) so the interior stays visible. Corners use wallCorner.
export function wallVariantFor(x, y, isWall, isOpen) {
  const n = isWall(x, y - 1);
  const s = isWall(x, y + 1);
  const e = isWall(x + 1, y);
  const w = isWall(x - 1, y);
  const count = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
  // interior = in-bounds AND non-wall. Out-of-bounds is exterior (never
  // interior), so map-border runs read as low front walls, not tall backs.
  const inS = isOpen(x, y + 1);
  const inN = isOpen(x, y - 1);
  const inE = isOpen(x + 1, y);
  const inW = isOpen(x - 1, y);
  const xRun = () => {
    if (inS && !inN) {
      if (!e && w) return 'wall:S'; // finished east end (door jamb / run end)
      if (!w && e) return 'wall:N'; // finished west end
      return 'wall:S';
    }
    if (inN && !inS) return 'fence:S'; // front run: low rail, keeps view open
    return 'wall:S';
  };
  const yRun = () => {
    if (inE && !inW) return 'wall:W'; // back run, full height
    if (inW && !inE) return 'fence:E'; // front run: low rail, keeps view open
    return 'wall:W';
  };
  if (count >= 3) return e && w ? xRun() : yRun();
  const alongX = e || w;
  const alongY = n || s;
  if (alongX && !alongY) return xRun();
  if (alongY && !alongX) return yRun();
  // Corners: tall when an adjacent run is back-type (room on the SE side),
  // low (wallCornerHalf) when both runs are front-type. Per-arm test:
  // x-run arms are back iff open to their south; y-run arms iff open east.
  const seOpen = isOpen(x + 1, y + 1);
  const swOpen = isOpen(x - 1, y + 1);
  const neOpen = isOpen(x + 1, y - 1);
  if (e && s) return seOpen ? 'wallCorner:S' : 'wallCornerHalf:S';
  if (s && w) return swOpen || seOpen ? 'wallCorner:N' : 'wallCornerHalf:N';
  if (w && n) return swOpen || neOpen ? 'wallCorner:W' : 'wallCornerHalf:W';
  if (n && e) return neOpen || seOpen ? 'wallCorner:E' : 'wallCornerHalf:E';
  if (alongX) return xRun();
  if (alongY) return yRun();
  return 'wall:S';
}
export const wallVariant = wallVariantFor;

// --- stair autotile (MUST match stairVariantFor in GameScene.ts) ---
// Wide flights open their interiors (stairsOpen) so they read as one
// continuous flight; tiles stacked in the ascend direction are
// continuations (steps), not restarted flights.
export function stairVariantFor(x, y, isStair) {
  const e = isStair(x + 1, y);
  const w = isStair(x - 1, y);
  const s = isStair(x, y + 1);
  const wide = e || w;
  if (wide) {
    if (s) return 'steps:S';
    if (e && w) return 'stairsOpen:S';
    return 'stairs:S';
  }
  if (isStair(x, y - 1) || s) {
    if (s) return 'steps:E';
    return 'stairs:E';
  }
  return 'stairs:S';
}

// --- grouped doorways (MUST match groupDoorTiles/doorSpriteFor in GameScene.ts) ---
// Contiguous E/P tiles form one opening: connected frame + single leaf.
export function groupDoorTiles(room, hasPortal, isShut, doorAxisAt) {
  const isDoor = (x, y) => {
    const ch = room.tiles[y]?.[x];
    return ch === 'E' || ch === 'P';
  };
  const seen = new Set();
  const out = new Map();
  const H = room.tiles.length;
  for (let y = 0; y < H; y++) {
    const row = room.tiles[y] ?? '';
    for (let x = 0; x < row.length; x++) {
      if (!isDoor(x, y) || seen.has(`${x},${y}`)) continue;
      const members = [];
      const stack = [{ x, y }];
      seen.add(`${x},${y}`);
      while (stack.length) {
        const cur = stack.pop();
        members.push(cur);
        for (const [nx, ny] of [[cur.x + 1, cur.y], [cur.x - 1, cur.y], [cur.x, cur.y + 1], [cur.x, cur.y - 1]]) {
          const k = `${nx},${ny}`;
          if (!seen.has(k) && isDoor(nx, ny)) {
            seen.add(k);
            stack.push({ x: nx, y: ny });
          }
        }
      }
      members.sort((a, b) => a.y - b.y || a.x - b.x);
      const axis = doorAxisAt(members[0].x, members[0].y);
      const linear =
        axis === 'S'
          ? members.every((m) => m.y === members[0].y)
          : members.every((m) => m.x === members[0].x);
      const ordered = [...members].sort((a, b) =>
        axis === 'S' ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x,
      );
      const count = ordered.length;
      const leafIdx = count === 1 ? 0 : Math.floor((count - 1) / 2);
      const hasPortalRun = ordered.some((m) => hasPortal(m.x, m.y));
      const shutRun = ordered.some((m) => hasPortal(m.x, m.y) && isShut(m.x, m.y));
      ordered.forEach((m, pos) => {
        const primary = pos === 0;
        const block = !linear;
        out.set(`${m.x},${m.y}`, {
          axis, pos, count, block,
          leaf: block ? primary && hasPortalRun : pos === leafIdx && hasPortalRun,
          hasPortal: hasPortalRun,
          shut: shutRun,
          hidden: block && !primary,
        });
      });
    }
  }
  return out;
}

export function doorSpriteFor(slot) {
  if (slot.hidden) return null;
  const a = slot.axis;
  if (slot.block) {
    if (slot.leaf) return `${slot.shut ? 'doorClosed' : 'doorOpen'}:${a}`;
    return `doorway:${a}`;
  }
  if (slot.leaf) return `${slot.shut ? 'doorClosed' : 'doorOpen'}:${a}`;
  if (slot.count === 1) return `doorway:${a}`;
  if (slot.pos === 0) return `doorwayLeft:${a}`;
  if (slot.pos === slot.count - 1) return `doorwayRight:${a}`;
  return `doorwayCenter:${a}`;
}

function main() {
  const [roomPath, outPath, themeArg] = process.argv.slice(2);
  if (!roomPath || !outPath) {
    console.error('usage: node scripts/iso-preview.mjs <room.json> <out.png> [theme]');
    process.exit(1);
  }
  const theme = THEME_ISO[themeArg] ? themeArg : null;
  const groundBase = theme ? THEME_GROUND[theme] : [null, 'floor'];
  const room = JSON.parse(readFileSync(roomPath, 'utf8'));
  const tiles = room.tiles;
  const H = tiles.length;
  const W = Math.max(...tiles.map((r) => r.length));
  const isWall = (x, y) =>
    y >= 0 && y < H && x >= 0 && x < (tiles[y]?.length ?? 0) && (tiles[y][x] === '#' || tiles[y][x] === 'G');
  const isDoorCh = (x, y) =>
    y >= 0 && y < H && x >= 0 && x < (tiles[y]?.length ?? 0) && (tiles[y][x] === 'E' || tiles[y][x] === 'P');
  // walls read door tiles as run-continuers so jambs finish cleanly
  const isRun = (x, y) => isWall(x, y) || isDoorCh(x, y);
  const inXRun = (x, y) => isWall(x - 1, y) || isWall(x + 1, y);
  const doorAxis = (x, y) => {
    const ax = isWall(x - 1, y) || isWall(x + 1, y);
    const ay = isWall(x, y - 1) || isWall(x, y + 1);
    if (ax && !ay) return 'S';
    if (ay && !ax) return 'E';
    return 'S'; // MUST match doorAxis fallback in GameScene.ts
  };
  const isOpen = (x, y) =>
    y >= 0 && y < H && x >= 0 && x < (tiles[y]?.length ?? 0) && tiles[y][x] !== '#' && tiles[y][x] !== 'G';
  // walls read door tiles as run-continuers so jambs finish cleanly
  const isRunWall = (x, y) => isWall(x, y) || isDoorCh(x, y);
  const wallAt = (x, y) => wallVariantFor(x, y, isRunWall, isOpen);
  const isStair = (x, y) =>
    y >= 0 && y < H && x >= 0 && x < (tiles[y]?.length ?? 0) && tiles[y][x] === '>';
  const portalSet = new Set((room.portals ?? []).map((p) => `${p.from.x},${p.from.y}`));
  const shutSet = new Set(
    (room.portals ?? []).filter((p) => p.lockedBy).map((p) => `${p.from.x},${p.from.y}`),
  );
  const doorSlots = groupDoorTiles(
    room,
    (x, y) => portalSet.has(`${x},${y}`),
    (x, y) => shutSet.has(`${x},${y}`),
    (x, y) => doorAxis(x, y),
  );

  // placement list in painter's order
  const jobs = [];
  const pos = previewTileToScreen;
  for (let s = 0; s <= W + H; s++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < (tiles[y]?.length ?? 0); x++) {
        if (x + y !== s) continue;
        const ch = tiles[y][x];
        const { sx, sy } = pos(x, y);
        jobs.push({ img: imgFor(groundBase[1], 'S', groundBase[0] ?? theme), sx, sy });
        if (ch === '#') {
          const v = process.env.WALLTEST ?? wallVariantFor(x, y, isRunWall, isOpen);
          const { base, dir } = parseSprite(v);
          jobs.push({ img: imgFor(base, dir), sx, sy });
        } else if (ch === 'G') {
          // window wall: window block in back x-runs, else plain wall rule
          const v = inXRun(x, y) && !isWall(x, y + 1) ? 'window:S' : wallVariantFor(x, y, isRunWall, isOpen);
          const { base, dir } = parseSprite(v);
          jobs.push({ img: imgFor(base, dir), sx, sy });
        } else if (ch === 'E' || ch === 'P') {
          const slot = doorSlots.get(`${x},${y}`);
          const v = slot ? doorSpriteFor(slot) : `doorway:${doorAxis(x, y)}`;
          if (v) {
            const { base, dir } = parseSprite(v);
            jobs.push({ img: imgFor(base, dir), sx, sy });
          }
        } else if (ch === '>') {
          const { base, dir } = parseSprite(stairVariantFor(x, y, isStair));
          jobs.push({ img: imgFor(base, dir), sx, sy });
        }
      }
    }
  }
  for (const pr of room.props ?? []) {
    const { pack, base, dir } = parseSprite(pr.sprite);
    const { sx, sy } = pos(pr.x, pr.y);
    jobs.push({ img: imgFor(base, dir, pack ?? theme), sx, sy });
  }

  const minSx = Math.min(...jobs.map((j) => j.sx)) - TW / 2;
  const maxSx = Math.max(...jobs.map((j) => j.sx)) + TW / 2;
  const minSy = -512 - TH / 2;
  const maxSy = Math.max(...jobs.map((j) => j.sy)) + TH / 2;
  const CW = Math.ceil(maxSx - minSx);
  const CH = Math.ceil(maxSy - minSy);
  const args = ['-size', `${CW}x${CH}`, 'xc:#1a1426'];
  for (const j of jobs) {
    // image bottom-center anchors at (sx, sy + TH/2)
    const dx = Math.round(j.sx - minSx - TW / 2);
    const dy = Math.round(j.sy - minSy + TH / 2 - 512);
    args.push(j.img, '-geometry', `+${dx}+${dy}`, '-composite');
  }
  args.push(outPath);
  execFileSync('magick', args, { stdio: 'inherit' });
  console.log(`wrote ${outPath} (${CW}x${CH}, ${jobs.length} sprites)`);
}

// Importable by scripts/check-projection.mjs (which needs the mirrors above
// without running the CLI). Direct invocation still renders the preview.
const invokedAsCli =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsCli) {
  main();
}
