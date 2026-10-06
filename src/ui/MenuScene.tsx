/**
 * Game-like menu backdrop: a small manor diorama composed from the real
 * isometric game sprites (same Kenney set + anchoring as GameScene, scaled
 * up for the menu). Pure presentational React — no Phaser needed.
 *
 * Layout (tile coords, x: 0..9, y: 0..6): back wall with a window and an
 * open door, a short stair flight rising toward it, crates, columns and the
 * player character facing the door. Painter's order (x+y) like the renderer.
 */

import { makeProjection } from '../movement/IsoTiles';

const BASE = import.meta.env.BASE_URL;
const ISO = `${BASE}prototype_sprites/Isometric`;

// Menu diamond footprint (px). Source sprites are 256x512.
const MENU_PROJ = makeProjection(112);
const IW = 112;
const IH = 224;

interface Placed {
  key: string;
  src: string;
  x: number; // tile x
  y: number; // tile y
}

const FLOORS: Placed[] = [];
for (let y = 0; y <= 6; y++) {
  for (let x = 0; x <= 9; x++) {
    FLOORS.push({ key: `f-${x}-${y}`, src: `${ISO}/floor_S.png`, x, y });
  }
}

// Back-wall run (y = 0) with a window and a single open door; side pieces
// stay single-tile so they keep the legacy full-arch look.
const WALLS: Placed[] = [
  { key: 'w-0', src: `${ISO}/wall_S.png`, x: 0, y: 0 },
  { key: 'w-1', src: `${ISO}/wall_S.png`, x: 1, y: 0 },
  { key: 'w-2', src: `${ISO}/wall_S.png`, x: 2, y: 0 },
  { key: 'w-3', src: `${ISO}/wall_S.png`, x: 3, y: 0 },
  { key: 'door', src: `${ISO}/doorOpen_S.png`, x: 4, y: 0 },
  { key: 'w-5', src: `${ISO}/wall_S.png`, x: 5, y: 0 },
  { key: 'w-6', src: `${ISO}/wall_S.png`, x: 6, y: 0 },
  { key: 'win', src: `${ISO}/window_S.png`, x: 7, y: 0 },
  { key: 'w-8', src: `${ISO}/wall_S.png`, x: 8, y: 0 },
  { key: 'w-9', src: `${ISO}/wall_S.png`, x: 9, y: 0 },
  // short east return so the corner reads as a room
  { key: 'e-1', src: `${ISO}/wall_W.png`, x: 9, y: 1 },
  { key: 'e-2', src: `${ISO}/wall_W.png`, x: 9, y: 2 },
];

const PROPS: Placed[] = [
  // stair flight rising toward the back wall (bottom row: full cheeks)
  { key: 'st-1', src: `${ISO}/stairs_S.png`, x: 6, y: 2 },
  { key: 'st-2', src: `${ISO}/stairs_S.png`, x: 7, y: 2 },
  { key: 'col-l', src: `${ISO}/column_S.png`, x: 3, y: 1 },
  { key: 'col-r', src: `${ISO}/column_S.png`, x: 5, y: 1 },
  { key: 'crate', src: `${ISO}/crate_S.png`, x: 1, y: 4 },
  { key: 'slab', src: `${ISO}/slab_S.png`, x: 4, y: 4 },
];

function styleFor(p: Placed): React.CSSProperties {
  const { sx, sy } = MENU_PROJ.tileToScreen(p.x, p.y);
  // Content space runs x: -392..560, y: -196..448; shift into the
  // 952x644 pan box (origin at content min) so the CSS framing math holds.
  return {
    left: sx - IW / 2 + 392,
    top: sy + MENU_PROJ.tileH / 2 - IH + 196,
    width: IW,
    height: IH,
  };
}

export function MenuScene() {
  // Merge + painter-sort so tall sprites occlude correctly.
  const jobs = [...FLOORS, ...WALLS, ...PROPS].sort((a, b) => a.x + a.y - (b.x + b.y));
  return (
    <div className="menu-scene" aria-hidden="true">
      <div className="menu-scene-pan">
        {jobs.map((j) => (
          <img key={j.key} src={j.src} alt="" draggable={false} style={styleFor(j)} />
        ))}
      </div>
      <div className="menu-scene-shade" />
    </div>
  );
}
