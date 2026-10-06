# Menu, transitions, i18n

## Menu concept

The game view **is** the page. The menu is a fullscreen living manor
diorama (`src/ui/MenuScene.tsx` — real game sprites, slow drift, vignette
melt) with the title and buttons overlaid on top of it. No boxed card, no
control cheatsheets, no character in the scene.

- `MainMenu.tsx` — `MANSION MYSTERY` + buttons only
  (New / Continue / Settings / Credits / Fullscreen). No taglines, no hints.
- `Settings.tsx` — language setting (+ title, back). Same fullscreen scene.
- `Credits.tsx` — Kenney/CC0 credit. Text-heavy blocks (credits, settings
  rows) sit on translucent panels for readability; the main menu stays bare.
- `App.tsx` — screens `menu | settings | credits | game`; boots/destroys the
  Phaser instance on game enter/leave; `Esc` in-game returns to menu.

## Transitions (all fades, no cuts)

| Transition | How |
|---|---|
| Menu → menu (any) | React `leaving` flag → `.menu.exit` opacity fade (0.42s, `EXIT_MS` in `App.tsx` — keep in sync with CSS) → screen swap |
| Menu → game | Same exit fade + `.stage-wrap.enter` CSS fade-in + Phaser `camera.fadeIn(280ms)` in `loadRoom` |
| Room → room (portals) | `camera.fadeOut(160ms)` → `loadRoom` → `fadeIn`; input blocked via `moving` across the fade |
| Mounts | Card rises (`cardUp`), scene fades (`sceneIn`) |

`loadRoomNoSave` (editor repaint path) never fades — it runs per paint stroke.
`prefers-reduced-motion` disables all of it (`style.css`).

## i18n (`src/text/i18n.ts`)

- Hand dictionary, no library: `tr(key, vars?)`, `useLang()` hook (React),
  `getLang()`/`setLang()` (game code). ~50 lines.
- Languages: `en` (+ `es`). Default: saved choice → browser sniff (`es*`) →
  English. Persisted under `mansion-mystery-lang`; also sets `<html lang>`.
- **The title `MANSION MYSTERY` is never translated** (stated in settings).
- Translated: menu, credits, settings, lock messages, noon chime
  (`{day}` interpolation). GameScene reads `tr()` at `say()` time — the game
  boots after the menu, so no live Phaser re-render is needed.
- Not translated (deliberate): `RoomDef` names/flavors/portal labels (not
  shown in-game; editor-only) and the dev-only panels (`DevTools`,
  `LevelEditor` stay English).
- **Adding a string**: add `key` to both `en` and `es` in `i18n.ts`, use
  `tr('…')` (React: also call `useLang()` so it re-renders on switch).
  Missing keys fall back to English, then to the key itself.
