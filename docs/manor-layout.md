# Manor Layout (design doc)

Ground truth for the manor's shape. The coded replica lives in `src/dev/testLevels.ts`
(dev profile only, placeholder sprites) until rooms are promoted to `src/rooms/manor.ts`.

## Entrance (exact, per sketch)

```
                   main hall
         -L stair----gate----R stair-
         |                          |
left library                        right drawing
         |                          |
         ----------entrance----------
```

- South wall: sealed entry doors (the "leaving is impossible" beat, future).
- North wall: **L stair | gate (archway, open) | R stair**. The two stairs rise
  separately and join into one gallery landing above — both lead to the same
  `gallery_landing`, which is how the replica expresses "join as they go up".
- West door → library. East door → drawing room. So the entrance has exactly
  4 connections: left, right, north gate, up.

## Ground floor

```
                     NORTH
  ┌──────────┬──────────────┬──────────┐
  │ Servants'│    Office 🔒 │ Kitchen🔒│
  │ room 🔒  │ (owners'work)│          │
  ├──────────┤              ├──────────┤
  │ Laundry  │  Main Hall   │ Dining   │
  ├──────────┤ (open roof,  │  Room    │
  │ Baths    │  noon clock) ├──────────┤
  │ (pools)  │              │ Drawing  │
  ├──────────┤              │  Room    │
  │ Library  │              ├──────────┤
  └────┬─────┴──── gate ────┴─────┬────┘
       │ ENTRANCE (stairs flank   │ L/R stairs
       │ gate on north wall)      │ → gallery
       └──────────────────────────┴────
                     SOUTH
```

West chain (quiet wing): entrance → library → baths → servants' room → laundry
(adjacent rooms, laundry opens off servants'). East chain: entrance → drawing
room → dining room → kitchen. Center: entrance → gate → main hall → office.
Rooms are NOT squares: maps carve L-shapes/alcoves out of the grid and furniture
(tables, shelves, pools, desks, beds, the clock, railings) marks blocked cells.

## Second floor (decided so far)

Open-void gallery landing over the main hall (railing edge, overlooks the clock).
West (owners' side, separated): master room 🔒 (+bath), art gallery, collection
room (mysterious artifacts — Arthur research bait, Samuel loot bait). East (guest
side): 5 guest rooms (player+Annie, Victoria, Arthur, Edward, Samuel), small
bathrooms, nursery at the far end, attic hatch* at the far end. Exact east/west
placements still open. No servant stairs (cut as repetitive) — the double stair
is the only vertical circulation. No physical room for the loop's cause: the
pocket watch IS the puzzle, resolution is event/condition-based, not a place.

## Locks & keys

| Room | Key | Rule |
|---|---|---|
| Servant's room 🔒 | Clara's key | Dies → take from body. Saved → ask; refuses unless rescued |
| Kitchen 🔒 | Thomas (schedule/trust, TBD) | Meal windows vs trust — TBD |
| Office 🔒 + Master room 🔒 | Master key (holder TBD; proposed Victoria) | One key, both rooms; never crosses Clara's key line |

Replica: locked portals block with a message and cost no time; dev tools can
unlock per-key for testing (`DevTools` → key toggles).

## Fixed beats tied to layout

- Main-hall clock chimes **noon every day** (implemented: `GameScene` watches for
  crossing 12:00 and posts it to the text engine).
- Clara dies **day-1 afternoon** in the laundry (deepest west room — the rescue
  dash costs real minutes by construction).
- Samuel knocks **night 1** at the sealed south doors.
- Meals at fixed times in the dining room.

## Semirandom geometry (model, not yet coded)

Deterministic anchors (stairs, gate, main spine) + unstable doors picking from
2–3 controlled destinations by weighted probability, seeded per loop. Diary
records observable tells. Collapse (day 3) closes optional areas first; the
entrance → gate → hall → stairs spine stays open longest.

## Camera

True isometric (Kenney Isometric set): diamond tiles, 1 tile = 1 sprite
footprint, depth-sorted tall sprites. Dollhouse cutaway convention enforced
by the wall autotile (`wallVariantFor` in `GameScene.ts`, mirrored by
`scripts/iso-preview.mjs`): back edges (room interior to the SE) render
full-height top walls with corners/windows/door arches; front edges render
as low fence rails so the interior stays visible. Screen compass: N = up
(W/Up), E = right (D/Right), 8-way movement (Q/E/Z/C diagonals), 1 min
per step, no corner-cutting through wall corners.

## Code mapping

Replica room ids: `entrance`, `main_hall`, `library`, `drawing_room`, `baths`,
`servants_room`, `laundry`, `dining_room`, `kitchen` (locked), `office`
(locked), `gallery_landing` (stub: stairs arrive, future doors walled).
Tile legend: `#` wall (autotiled), `.` floor, `S` spawn, `E`/`P` door floor,
`>` stairs (ascend grid-north), `G` window wall (north runs), `T` table,
`B` shelf, `W` water, `C` clock, `D` desk/piano, `d` bed, `R` railing
(renders as a fence rail). Anything unlisted is blocked.

TODO: second-floor rooms, key items/quest flags, front-door loop beat, collapse
rerouting.
