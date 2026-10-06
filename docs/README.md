# Mansion Mystery — docs

Victorian time-loop mystery in an impossible manor. Isometric web game
(Vite + TypeScript + Phaser + React). You investigate, the clock advances,
every three days the loop resets — only your diary remembers.

- Design intent: [`idea.md`](idea.md) (story, characters, loop rules)
- Manor shape: [`manor-layout.md`](manor-layout.md) (ground truth; coded
  replica lives in `src/dev/testLevels.ts` until rooms graduate to prod)

## Pages

| Page | What |
|---|---|
| [`tech-stack.md`](tech-stack.md) | Tech used, scripts, prod/dev guards, storage keys |
| [`game-state.md`](game-state.md) | Current state: playable systems, stubs, controls, known limits |
| [`tiles-and-sprites.md`](tiles-and-sprites.md) | Tile system essentials + how to use the art assets |
| [`ui.md`](ui.md) | Menu concept, screen transitions, i18n + settings |

## Tech snapshot

- **Vite 7 + TypeScript + Phaser 3.90** (game canvas) **+ React 19** (overlay UI).
- **Art**: Kenney Prototype Pack (Isometric + Human characters), CC0, vendored
  under `public/prototype_sprites/`. No external assets at runtime.
- **No backend**: saves + language live in `localStorage`.
- **Dev safety**: `src/dev/` never ships — enforced by a Vite plugin
  (`no-dev-in-prod`, fails prod builds) and `npm run check:prod-leak`.
- Verify visuals without booting: `node scripts/iso-preview.mjs room.json out.png`
  (needs ImageMagick `magick`).

## Current state snapshot

Playable loop: 2 prod rooms (`entrance_hall`, `library`) with portal jumps,
4-direction tile movement (1 min/step), locked doors (3 keys), noon chime,
autosave/continue, EN/ES UI with a settings page. Full status:
[`game-state.md`](game-state.md).
