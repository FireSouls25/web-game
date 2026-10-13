import { THEME_CATALOGS } from './catalog';
import { ARCHETYPE_BRIEF, type Difficulty } from './difficulty';

/**
 * Prompt construction for the map-design call. The model gets:
 * theme vocab (so the look stays coherent), the ascii legend, the
 * exact size + pickup/enemy budgets from the difficulty curve, the
 * hard constraints (mirroring validateLevel — the server enforces
 * them, never the model), and one small shape example.
 * Everything is pure strings: testable without any key or network.
 */

export interface LevelPrompt {
  system: string;
  user: string;
}

const LEGEND = `legend: '#' wall (blocked), '.' floor (walk), 'S' spawn floor (walk, exactly the spawn tile), 'E' exit floor (walk, exactly the exit tile)`;

function vocabBlock(d: Difficulty): string {
  const cat = THEME_CATALOGS[d.theme];
  return [
    'sprite vocabulary for THIS room (use ONLY these bases, prefixed with the theme — anything else is rejected):',
    `grounds (pick ONE for the whole room): ${cat.grounds.join(', ')}`,
    `walls (use for '#'-adjacent decor only): ${cat.walls.join(', ') || '(none — open-air theme, no wall decor)'}`,
    `furniture (props): ${cat.furniture.join(', ')}`,
    `pickup sprites: ${cat.pickups.join(', ')}`,
    'example id: "dungeon:chestClosed:S" (= S facing) or "dungeon:chestClosed:E".',
  ].join('\n');
}

const EXAMPLE_JSON = `{
  "id": "example-1",
  "theme": "dungeon",
  "tiles": [
    "#########",
    "#S......#",
    "#.##.##.#",
    "#.......#",
    "#.##.##.#",
    "#......E#",
    "#########"
  ],
  "spawn": { "x": 1, "y": 1 },
  "exit": { "x": 7, "y": 5 },
  "pickups": [
    { "id": "key_1", "x": 7, "y": 1, "sprite": "dungeon:chestClosed:S" },
    { "id": "key_2", "x": 1, "y": 5, "sprite": "dungeon:barrel:S" }
  ],
  "enemies": [
    { "id": "chaser_1", "kind": "chaser", "x": 4, "y": 3 }
  ],
  "props": []
}`;

export function buildLevelPrompt(d: Difficulty, seed: number): LevelPrompt {
  const system =
    'You design isometric movement-puzzle levels for a tile game. ' +
    'Reply with JSON ONLY — no markdown fences, no commentary. ' +
    'Every coordinate is an integer tile {x, y} with (0,0) top-left. ' +
    'You know where each element is: emit exact coordinates for spawn, exit, every pickup, every enemy, and every prop footprint tile.';
  const user = [
    `seed ${seed} | depth ${d.depth} | theme ${d.theme} | archetype ${d.archetype}: ${ARCHETYPE_BRIEF[d.archetype]}`,
    `size: exactly ${d.height} rows of exactly ${d.width} characters.`,
    LEGEND,
    vocabBlock(d),
    'budgets:',
    `- pickups: exactly ${d.pickups} (sprites from the pickup list above, prefixed like "${d.theme}:${THEME_CATALOGS[d.theme].pickups[0]}:S"; no two adjacent, all >= 3 manhattan from spawn)`,
    `- enemies: exactly ${d.chasers} chaser(s)${d.patrols > 0 ? ` plus exactly ${d.patrols} patrol with >= 2 waypoints on walkable tiles` : ''} (each >= 5 walkable steps from spawn; chasers get \`tempo\`: ${d.chaserTempo} = one step every ${d.chaserTempo} player turn(s))`,
    `- props: 0-4 decor/blocker entities; each has anchor + footprint (1-6 absolute tiles, anchor inside footprint, never on walls/spawn/exit/pickups/enemies when blocking)`,
    'hard constraints (the level is rejected unless ALL hold):',
    '- rectangle, border fully walled with #;',
    '- one connected walkable region: flood fill from spawn reaches exit + all pickups;',
    `- spawn↔exit manhattan >= ${Math.floor((d.width + d.height) / 2)};`,
    '- S appears once (the spawn tile), E appears once (the exit tile);',
    '- never mix packs: every sprite starts with the room theme and uses ONLY the vocabulary above;',
    '- escapability: a solver plays your level with the exact game rules and it is REJECTED unless a full collect-and-exit path exists that never touches an enemy — never force a 1-wide dead-end around a pickup or the exit;',
    '- controls: the player steps N/E/S/W one tile per turn or WAITS in place; enemies still move on their tempo beats — leave breathing room;',
    `par hint: ~${d.par} moves. Set "par" to ${d.par}.`,
    'shape example (copy the JSON shape, not the content):',
    EXAMPLE_JSON,
  ].join('\n');
  return { system, user };
}

/** Follow-up message when the first output failed validation. */
export function buildRepairPrompt(levelJson: string, errors: string[]): string {
  return [
    'Your previous level was REJECTED. Fix every error, keep everything else.',
    'Errors:',
    ...errors.map((e) => `- ${e}`),
    'Previous JSON:',
    levelJson,
    'Reply with the corrected full JSON ONLY.',
  ].join('\n');
}
