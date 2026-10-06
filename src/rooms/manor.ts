import type { RoomDef } from './types';
import { RoomRegistry } from './types';

/**
 * Minimal production manor graph (placeholder geometry).
 * Real manor rooms + impossible-geometry connections go here.
 * Dev test rooms live in src/dev/ and are never registered in prod.
 */
export const entranceHall: RoomDef = {
  id: 'entrance_hall',
  name: 'Entrance Hall',
  tiles: [
    '######GG####GG######',
    '##................##',
    '##................##',
    '##................##',
    '##......SS........##',
    '##......SS........##',
    '##................##',
    '##................##',
    '##................##',
    '##................##',
    '##................##',
    '##................##',
    '##................EE',
    '##................EE',
    '##................##',
    '####################',
  ],
  spawn: { x: 8, y: 4 },
  portals: [
    { from: { x: 18, y: 12 }, toRoom: 'library', to: { x: 2, y: 2 }, label: 'east door' },
    { from: { x: 19, y: 12 }, toRoom: 'library', to: { x: 2, y: 2 }, label: 'east door' },
    { from: { x: 18, y: 13 }, toRoom: 'library', to: { x: 2, y: 2 }, label: 'east door' },
    { from: { x: 19, y: 13 }, toRoom: 'library', to: { x: 2, y: 2 }, label: 'east door' },
  ],
  // decor placed with the dev level editor (DevTools → level editor)
  props: [
    { id: 'entrance_crate_a', sprite: 'crate', x: 4, y: 4, walkable: false },
    { id: 'entrance_slab_rug', sprite: 'slab', x: 12, y: 8, walkable: true },
    { id: 'entrance_col_w', sprite: 'column:S', x: 7, y: 2, walkable: false },
    { id: 'entrance_col_e', sprite: 'column:S', x: 12, y: 2, walkable: false },
    { id: 'entrance_arrow_w', sprite: 'arrow:S', x: 8, y: 11, walkable: true },
    { id: 'entrance_arrow_e', sprite: 'arrow:S', x: 11, y: 11, walkable: true },
    // sealed doors stand on the floor in front of the south wall (props on
    // wall tiles render behind the wall face and vanish)
    { id: 'entrance_sealed_w', sprite: 'doorClosed:S', x: 8, y: 14, walkable: false },
    { id: 'entrance_sealed_e', sprite: 'doorClosed:S', x: 11, y: 14, walkable: false },
  ],
  flavor: 'Dusty foyer. The clock ticks louder than it should.',
};

export const library: RoomDef = {
  id: 'library',
  name: 'Library',
  tiles: [
    '################',
    '################',
    'EE......SS......',
    'EE......SS......',
    '##....####......',
    '##....####......',
    '##....####......',
    '##....####......',
    '##..............',
    '##..............',
    '################',
    '################',
  ],
  spawn: { x: 8, y: 2 },
  portals: [
    { from: { x: 0, y: 2 }, toRoom: 'entrance_hall', to: { x: 16, y: 12 }, label: 'west door' },
    { from: { x: 1, y: 2 }, toRoom: 'entrance_hall', to: { x: 16, y: 12 }, label: 'west door' },
    { from: { x: 0, y: 3 }, toRoom: 'entrance_hall', to: { x: 16, y: 12 }, label: 'west door' },
    { from: { x: 1, y: 3 }, toRoom: 'entrance_hall', to: { x: 16, y: 12 }, label: 'west door' },
  ],
  props: [
    { id: 'library_block_shelf', sprite: 'block', x: 10, y: 8, walkable: false },
  ],
  flavor: 'Shelves that seem to rearrange when unobserved.',
};

export function createProdRegistry(): RoomRegistry {
  const reg = new RoomRegistry();
  reg.register(entranceHall);
  reg.register(library);
  return reg;
}
