/**
 * ONE-TIME migration: subdivide every room map 1 tile -> 2x2 tiles.
 * Tile size stays one sprite footprint (64x32 diamond); maps gain 2x
 * resolution so movement granularity doubles and doors read 2-wide.
 *
 * - tiles: each char x2 horizontally, each row x2 vertically
 * - spawn/to: (x,y) -> (2x,2y)   [top-left sub-tile, same char]
 * - portal from: (x,y) -> all 4 sub-tiles (every sub-tile of a door
 *   triggers, so 1-wide doors become fully walkable 2-wide arches)
 * - props: (x,y) -> (2x,2y)
 *
 * Usage: node scripts/subdivide.mjs <file.ts> [--write]
 * Without --write it prints the diff to stdout (dry run).
 */
import { readFileSync, writeFileSync } from 'node:fs';

function expandTilesBlock(inner) {
  const lines = inner.split('\n');
  const out = [];
  for (const line of lines) {
    const m = line.match(/^(\s*)'([^']*)'(,?)\s*$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const [, indent, row, comma] = m;
    const wide = [...row].map((ch) => ch + ch).join('');
    out.push(`${indent}'${wide}'${comma}`);
    out.push(`${indent}'${wide}'${comma}`);
  }
  return out.join('\n');
}

function subdivide(text) {
  // tiles arrays (no nested arrays inside, so non-greedy to ], is safe)
  text = text.replace(/tiles:\s*\[([\s\S]*?)\n(\s*)\],/g, (m, inner, indent) => {
    return `tiles: [${expandTilesBlock(inner)}\n${indent}],`;
  });
  // spawn + portal destinations
  text = text.replace(
    /(spawn:\s*\{\s*x:\s*)(\d+)(,\s*y:\s*)(\d+)(\s*\})/g,
    (_m, a, x, b, y, c) => `${a}${Number(x) * 2}${b}${Number(y) * 2}${c}`,
  );
  // portals: duplicate `from` over the 2x2, scale `to`
  text = text.replace(/portals:\s*\[/g, 'portals: [');
  text = text.replace(
    /\{\s*from:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)\s*\}([\s\S]*?)to:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)\s*\}([\s\S]*?)\}/g,
    (m, fx, fy, mid, tx, ty, rest, offset, full) => {
      // find the line indent of this portal object
      const lineStart = full.lastIndexOf('\n', offset) + 1;
      const indent = full.slice(lineStart, offset).match(/^\s*/)[0];
      const nx = Number(fx) * 2;
      const ny = Number(fy) * 2;
      const dx = Number(tx) * 2;
      const dy = Number(ty) * 2;
      const cells = [
        [nx, ny],
        [nx + 1, ny],
        [nx, ny + 1],
        [nx + 1, ny + 1],
      ];
      return cells
        .map(
          ([cx, cy]) =>
            `{ from: { x: ${cx}, y: ${cy} }${mid}to: { x: ${dx}, y: ${dy} }${rest}}`,
        )
        .join(',\n' + indent);
    },
  );
  // props coords
  text = text.replace(
    /(\{\s*id:\s*'[^']+',\s*sprite:\s*'[^']+',\s*x:\s*)(\d+)(,\s*y:\s*)(\d+)/g,
    (_m, a, x, b, y) => `${a}${Number(x) * 2}${b}${Number(y) * 2}`,
  );
  return text;
}

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/subdivide.mjs <file.ts> [--write]');
  process.exit(1);
}
const src = readFileSync(file, 'utf8');
const out = subdivide(src);
if (flag === '--write') {
  writeFileSync(file, out);
  console.log(`subdivided ${file}`);
} else {
  process.stdout.write(out);
}
