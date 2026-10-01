/**
 * DEV-PROFILE ONLY.
 *
 * Playable replica of docs/manor-layout.md (ground floor + gallery stub),
 * placeholder sprites. This module must never be imported by production code
 * paths — loaded via dynamic `import()` guarded by `import.meta.env.DEV`
 * (see GameScene), so prod bundlers drop it.
 *
 * Tile legend: '#' wall, '.' floor, 'S' spawn, 'E'/'P' door floor,
 * '>' stairs, 'T' table, 'B' shelf, 'W' water, 'C' clock, 'D' desk,
 * 'd' bed, 'R' railing.
 */
import type { RoomDef } from '../rooms/types';

const entrance: RoomDef = {
  id: 'entrance',
  name: 'Entrance Passage',
  tiles: [
    '#>>##EEE##>>#',
    '#...........#',
    '#..T.....T..#',
    '#...........#',
    'E.....S.....E',
    '#...........#',
    '#..T.....T..#',
    '#...........#',
    '#############',
  ],
  spawn: { x: 6, y: 4 },
  portals: [
    { from: { x: 5, y: 0 }, toRoom: 'main_hall', to: { x: 6, y: 6 }, label: 'gate' },
    { from: { x: 6, y: 0 }, toRoom: 'main_hall', to: { x: 6, y: 6 }, label: 'gate' },
    { from: { x: 7, y: 0 }, toRoom: 'main_hall', to: { x: 6, y: 6 }, label: 'gate' },
    { from: { x: 1, y: 0 }, toRoom: 'gallery_landing', to: { x: 2, y: 5 }, label: 'L stair' },
    { from: { x: 2, y: 0 }, toRoom: 'gallery_landing', to: { x: 2, y: 5 }, label: 'L stair' },
    { from: { x: 10, y: 0 }, toRoom: 'gallery_landing', to: { x: 10, y: 5 }, label: 'R stair' },
    { from: { x: 11, y: 0 }, toRoom: 'gallery_landing', to: { x: 10, y: 5 }, label: 'R stair' },
    { from: { x: 0, y: 4 }, toRoom: 'library', to: { x: 10, y: 3 }, label: 'west door' },
    { from: { x: 12, y: 4 }, toRoom: 'drawing_room', to: { x: 1, y: 3 }, label: 'east door' },
  ],
  flavor: 'Sealed doors behind you. Stairs flank the gate ahead.',
};

const mainHall: RoomDef = {
  id: 'main_hall',
  name: 'Main Hall',
  tiles: [
    '######EE#####',
    '#.....C.....#',
    '#.#.......#.#',
    '#...........#',
    '#...T...T...#',
    '#.....S.....#',
    '#...........#',
    '#####EEE#####',
  ],
  spawn: { x: 6, y: 5 },
  portals: [
    { from: { x: 5, y: 7 }, toRoom: 'entrance', to: { x: 6, y: 1 }, label: 'gate' },
    { from: { x: 6, y: 7 }, toRoom: 'entrance', to: { x: 6, y: 1 }, label: 'gate' },
    { from: { x: 7, y: 7 }, toRoom: 'entrance', to: { x: 6, y: 1 }, label: 'gate' },
    { from: { x: 6, y: 0 }, toRoom: 'office', to: { x: 4, y: 4 }, label: 'office door', lockedBy: 'master' },
    { from: { x: 7, y: 0 }, toRoom: 'office', to: { x: 4, y: 4 }, label: 'office door', lockedBy: 'master' },
  ],
  flavor: 'Double-height hall. The great clock ticks toward noon.',
};

const library: RoomDef = {
  id: 'library',
  name: 'Library',
  tiles: [
    '####EE######',
    '#.BB..BB...#',
    '#.BB..BB...#',
    '#..........E',
    '#..S..BB...#',
    '#.BB..BB...#',
    '#.....D....#',
    '############',
  ],
  spawn: { x: 3, y: 4 },
  portals: [
    { from: { x: 11, y: 3 }, toRoom: 'entrance', to: { x: 1, y: 4 }, label: 'east door' },
    { from: { x: 4, y: 0 }, toRoom: 'baths', to: { x: 5, y: 5 }, label: 'north door' },
    { from: { x: 5, y: 0 }, toRoom: 'baths', to: { x: 5, y: 5 }, label: 'north door' },
  ],
  flavor: 'Shelves that seem to rearrange when unobserved.',
};

const drawingRoom: RoomDef = {
  id: 'drawing_room',
  name: 'Drawing Room',
  tiles: [
    '#####EE#####',
    '#....TT....#',
    '#..........#',
    'E...TT.....#',
    '#...S......#',
    '#....TT....#',
    '#.....D....#',
    '############',
  ],
  spawn: { x: 4, y: 4 },
  portals: [
    { from: { x: 0, y: 3 }, toRoom: 'entrance', to: { x: 11, y: 4 }, label: 'west door' },
    { from: { x: 5, y: 0 }, toRoom: 'dining_room', to: { x: 6, y: 5 }, label: 'north door' },
    { from: { x: 6, y: 0 }, toRoom: 'dining_room', to: { x: 6, y: 5 }, label: 'north door' },
  ],
  flavor: "Victoria holds court here. The pianoforte is never quite in tune.",
};

const baths: RoomDef = {
  id: 'baths',
  name: 'Baths',
  tiles: [
    '#####E#####',
    '#.WW...WW.#',
    '#.WW...WW.#',
    '#.....S...#',
    '#.........#',
    '#.WW...WW.#',
    '#....EE...#',
    '###########',
  ],
  spawn: { x: 6, y: 3 },
  portals: [
    { from: { x: 5, y: 6 }, toRoom: 'library', to: { x: 5, y: 1 }, label: 'south door' },
    { from: { x: 6, y: 6 }, toRoom: 'library', to: { x: 5, y: 1 }, label: 'south door' },
    { from: { x: 5, y: 0 }, toRoom: 'servants_room', to: { x: 4, y: 5 }, label: 'north door', lockedBy: 'servant' },
  ],
  flavor: 'Pool-like tubs, faintly warm. No one admits to heating them.',
};

const servantsRoom: RoomDef = {
  id: 'servants_room',
  name: "Servants' Room",
  tiles: [
    '##########',
    '#.d....d.#',
    '#.....S..#',
    '#........E',
    '#.d....d.#',
    '#........#',
    '####E#####',
  ],
  spawn: { x: 6, y: 2 },
  portals: [
    { from: { x: 4, y: 6 }, toRoom: 'baths', to: { x: 5, y: 1 }, label: 'south door' },
    { from: { x: 9, y: 3 }, toRoom: 'laundry', to: { x: 1, y: 3 }, label: 'laundry door' },
  ],
  flavor: "Clara's narrow bed is made with military precision.",
};

const laundry: RoomDef = {
  id: 'laundry',
  name: 'Laundry',
  tiles: [
    '#########',
    '#.W.W.S.#',
    '#.......#',
    'E...T...#',
    '#.W.W...#',
    '#.......#',
    '#########',
  ],
  spawn: { x: 6, y: 1 },
  portals: [
    { from: { x: 0, y: 3 }, toRoom: 'servants_room', to: { x: 8, y: 3 }, label: 'west door' },
  ],
  flavor: 'Steam, lye, silence. Something bad happens here on day 1.',
};

const diningRoom: RoomDef = {
  id: 'dining_room',
  name: 'Dining Room',
  tiles: [
    '#####EE#####',
    '#.TTTTTT...#',
    '#.TTTTTT...#',
    '#.....S....#',
    '#..........#',
    '#..........#',
    '#....EE....#',
    '############',
  ],
  spawn: { x: 6, y: 3 },
  portals: [
    { from: { x: 5, y: 6 }, toRoom: 'drawing_room', to: { x: 6, y: 2 }, label: 'south door' },
    { from: { x: 6, y: 6 }, toRoom: 'drawing_room', to: { x: 6, y: 2 }, label: 'south door' },
    { from: { x: 5, y: 0 }, toRoom: 'kitchen', to: { x: 8, y: 1 }, label: 'kitchen door', lockedBy: 'kitchen' },
    { from: { x: 6, y: 0 }, toRoom: 'kitchen', to: { x: 8, y: 1 }, label: 'kitchen door', lockedBy: 'kitchen' },
  ],
  flavor: 'A table set for more people than are present.',
};

const kitchen: RoomDef = {
  id: 'kitchen',
  name: 'Kitchen',
  tiles: [
    '##########',
    '#.D....S.#',
    '#.TT.....#',
    '#........#',
    '#...WW...#',
    '#........#',
    '#...EE...#',
    '##########',
  ],
  spawn: { x: 7, y: 1 },
  portals: [
    { from: { x: 4, y: 6 }, toRoom: 'dining_room', to: { x: 5, y: 5 }, label: 'south door' },
    { from: { x: 5, y: 6 }, toRoom: 'dining_room', to: { x: 5, y: 5 }, label: 'south door' },
  ],
  flavor: "Thomas's domain. Knives aligned, tempers less so.",
};

const office: RoomDef = {
  id: 'office',
  name: "Master's Office",
  tiles: [
    '###########',
    '#.BBBBB...#',
    '#.....S...#',
    '#...DDD...#',
    '#.........#',
    '#...EE....#',
    '###########',
  ],
  spawn: { x: 6, y: 2 },
  portals: [
    { from: { x: 4, y: 5 }, toRoom: 'main_hall', to: { x: 7, y: 1 }, label: 'south door' },
    { from: { x: 5, y: 5 }, toRoom: 'main_hall', to: { x: 7, y: 1 }, label: 'south door' },
  ],
  flavor: "The owners' workroom. Ledgers stop mid-sentence.",
};

const galleryLanding: RoomDef = {
  id: 'gallery_landing',
  name: 'Gallery Landing (stub)',
  tiles: [
    '#############',
    '#...........#',
    '#.....S.....#',
    '#..RRRRRRR..#',
    '#...........#',
    '#...........#',
    '##>>#####>>##',
  ],
  spawn: { x: 6, y: 2 },
  portals: [
    { from: { x: 2, y: 6 }, toRoom: 'entrance', to: { x: 2, y: 1 }, label: 'L stair down' },
    { from: { x: 3, y: 6 }, toRoom: 'entrance', to: { x: 2, y: 1 }, label: 'L stair down' },
    { from: { x: 9, y: 6 }, toRoom: 'entrance', to: { x: 10, y: 1 }, label: 'R stair down' },
    { from: { x: 10, y: 6 }, toRoom: 'entrance', to: { x: 10, y: 1 }, label: 'R stair down' },
  ],
  flavor: 'Railing over the void. Second-floor rooms arrive later.',
};

export const DEV_TEST_ROOMS: RoomDef[] = [
  entrance,
  mainHall,
  library,
  drawingRoom,
  baths,
  servantsRoom,
  laundry,
  diningRoom,
  kitchen,
  office,
  galleryLanding,
];

/** First room loaded in dev profile. */
export const DEV_START_ROOM = 'entrance';
