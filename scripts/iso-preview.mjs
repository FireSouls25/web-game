/**
 * DEV-ONLY preview renderer — software iso compositor (ImageMagick) that
 * mirrors GameScene.renderRoom so wall variants / room layouts can be
 * checked without booting the game.
 *
 * Usage:
 *   node scripts/iso-preview.mjs <room.json> <out.png>
 *
 * room.json: { "tiles": [...ascii...], "props": [{sprite:"wall:N",x,y}] }
 * Sprite ids use the same "base" / "base:DIR" convention as RoomProp.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ISO = join(ROOT, 'public/prototype_sprites/Isometric');

const TW = 256; // native diamond footprint
const TH = 128;

function parseSprite(sprite) {
  const i = sprite.indexOf(':');
  if (i < 0) return { base: sprite, dir: 'S' };
  return { base: sprite.slice(0, i), dir: sprite.slice(i + 1).toUpperCase() };
}

function imgFor(base, dir) {
  return join(ISO, `${base}_${dir}.png`);
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

function main() {
  const [roomPath, outPath] = process.argv.slice(2);
  if (!roomPath || !outPath) {
    console.error('usage: node scripts/iso-preview.mjs <room.json> <out.png>');
    process.exit(1);
  }
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
    return ax ? 'S' : 'E';
  };
  const isOpen = (x, y) =>
    y >= 0 && y < H && x >= 0 && x < (tiles[y]?.length ?? 0) && tiles[y][x] !== '#' && tiles[y][x] !== 'G';
  // walls read door tiles as run-continuers so jambs finish cleanly
  const isRunWall = (x, y) => isWall(x, y) || isDoorCh(x, y);
  const wallAt = (x, y) => wallVariantFor(x, y, isRunWall, isOpen);

  // placement list in painter's order
  const jobs = [];
  const pos = (x, y) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) });
  for (let s = 0; s <= W + H; s++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < (tiles[y]?.length ?? 0); x++) {
        if (x + y !== s) continue;
        const ch = tiles[y][x];
        const { sx, sy } = pos(x, y);
        jobs.push({ img: imgFor('floor', 'S'), sx, sy });
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
          const d = inXRun(x, y) ? 'S' : 'E';
          jobs.push({ img: imgFor('doorway', d), sx, sy });
        } else if (ch === '>') {
          jobs.push({ img: imgFor('stairs', 'S'), sx, sy });
        }
      }
    }
  }
  for (const pr of room.props ?? []) {
    const { base, dir } = parseSprite(pr.sprite);
    const { sx, sy } = pos(pr.x, pr.y);
    jobs.push({ img: imgFor(base, dir), sx, sy });
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

main();
