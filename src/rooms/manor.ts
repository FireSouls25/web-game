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
    '##########',
    '#........#',
    '#...S....#',
    '#........#',
    '#...##...#',
    '#...##...#',
    '#........E',
    '##########',
  ],
  spawn: { x: 4, y: 2 },
  portals: [
    { from: { x: 9, y: 6 }, toRoom: 'library', to: { x: 1, y: 1 }, label: 'east door' },
  ],
  flavor: 'Dusty foyer. The clock ticks louder than it should.',
};

export const library: RoomDef = {
  id: 'library',
  name: 'Library',
  tiles: [
    '########',
    'E...S...',
    '#..##...',
    '#..##...',
    '#.......',
    '########',
  ],
  spawn: { x: 4, y: 1 },
  portals: [
    { from: { x: 0, y: 1 }, toRoom: 'entrance_hall', to: { x: 8, y: 6 }, label: 'west door' },
  ],
  flavor: 'Shelves that seem to rearrange when unobserved.',
};

export function createProdRegistry(): RoomRegistry {
  const reg = new RoomRegistry();
  reg.register(entranceHall);
  reg.register(library);
  return reg;
}
