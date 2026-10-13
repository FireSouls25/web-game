/**
 * DEV-PROFILE ONLY — engine-style level editor dock: paint autotiled walls,
 * floors, doors, windows and stairs; drop/rotate/restyle decor props from
 * the full Isometric sprite catalog; toggle per-tile hitboxes; edit doors
 * (portals) with targets and locks; resize rooms; export to manor.ts.
 * Never imported by prod code (see App.tsx dynamic import).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type Phaser from 'phaser';
import type { EditorBrush, EditorTool, ManorBridge, RoomSnapshot } from '../core/bridge';
import type { LockKey, RoomProp } from '../rooms/types';
import {
  DIRS_4,
  TILE_BRUSHES,
  propSpriteId,
  type IsoDir,
} from '../rooms/spriteCatalog';
import {
  CATALOG_BASES,
  QUICK_PACK_PROPS,
  editorBaseDir,
  entityThumb,
} from '../level/catalog';

const EDITOR_STORE_KEY = 'manor-loop-editor-v1';

type Tool = EditorTool;

const TOOLS: Array<{ id: Tool; label: string; hint: string }> = [
  { id: 'paint', label: '🖌 Paint', hint: 'Left-click / drag diamonds to paint. Right-drag pans, wheel zooms.' },
  { id: 'spawn', label: '📍 Spawn', hint: 'Click a diamond to move the player spawn there.' },
  { id: 'walk', label: '🚧 Hitbox', hint: 'Click a diamond to flip walkable / blocked. White outline = override.' },
  { id: 'prop-add', label: '＋ Prop', hint: 'Pick a sprite below, then click a diamond to place it.' },
  { id: 'prop-edit', label: '✏ Edit prop', hint: 'Click a placed prop (or its list row) to select, then restyle it.' },
  { id: 'prop-delete', label: '🗑 Del prop', hint: 'Click a decor sprite to remove it. (Del key removes the selection.)' },
  { id: 'portal', label: '🚪 Doors', hint: 'Drag a gold-outlined door diamond to move it; retarget below.' },
];

const NEXT_DIR: Record<IsoDir, IsoDir> = { N: 'E', E: 'S', S: 'W', W: 'N' };

function bridgeOf(game: Phaser.Game | null): ManorBridge | undefined {
  return (game as unknown as { __manor?: ManorBridge } | null)?.__manor;
}

/** Typed brush payload for the current tool (tile char for paint, sprite for prop-add). */
function toolBrush(tool: Tool, brush: string, propBase: string, propDir: IsoDir): EditorBrush {
  return tool === 'prop-add'
    ? { kind: 'prop', sprite: propSpriteId(propBase, propDir) }
    : { kind: 'tile', ch: brush };
}

/** Turn editor export JSON into a drop-in `src/rooms/manor.ts`. */
function exportToManorTs(exportJson: string): string {
  const data = JSON.parse(exportJson) as {
    rooms: Array<{
      id: string;
      name: string;
      tiles: string[];
      spawn: { x: number; y: number };
      portals: RoomSnapshot['portals'];
      props: RoomProp[];
      flavor: string;
    }>;
  };
  const ident = (id: string) => {
    const s = id.replace(/[^a-zA-Z0-9_]/g, '_');
    return /^[0-9]/.test(s) ? `room_${s}` : s;
  };
  const out: string[] = [
    "import type { RoomDef } from './types';",
    "import { RoomRegistry } from './types';",
    '',
    '/** Generated with the dev level editor (DevTools → Level editor → Copy manor.ts). */',
  ];
  for (const r of data.rooms) {
    out.push(`\nexport const ${ident(r.id)}: RoomDef = {`);
    out.push(`  id: '${r.id}',`);
    out.push(`  name: ${JSON.stringify(r.name)},`);
    out.push('  tiles: [');
    for (const row of r.tiles) out.push(`    '${row}',`);
    out.push('  ],');
    out.push(`  spawn: { x: ${r.spawn.x}, y: ${r.spawn.y} },`);
    out.push('  portals: [');
    for (const p of r.portals) {
      const lock = p.lockedBy ? `, lockedBy: '${p.lockedBy}'` : '';
      const label = p.label ? `, label: ${JSON.stringify(p.label)}` : '';
      out.push(
        `    { from: { x: ${p.from.x}, y: ${p.from.y} }, toRoom: '${p.toRoom}', to: { x: ${p.to.x}, y: ${p.to.y} }${label}${lock} },`,
      );
    }
    out.push('  ],');
    if (r.props.length) {
      out.push('  props: [');
      for (const pr of r.props) {
        out.push(`    { id: '${pr.id}', sprite: '${pr.sprite}', x: ${pr.x}, y: ${pr.y}, walkable: ${pr.walkable} },`);
      }
      out.push('  ],');
    }
    out.push(`  flavor: ${JSON.stringify(r.flavor)},`);
    out.push('};');
  }
  out.push('\nexport function createProdRegistry(): RoomRegistry {');
  out.push('  const reg = new RoomRegistry();');
  for (const r of data.rooms) out.push(`  reg.register(${ident(r.id)});`);
  out.push('  return reg;');
  out.push('}');
  return out.join('\n');
}

export function LevelEditor({ game }: { game: Phaser.Game | null }) {
  const [enabled, setEnabled] = useState(false);
  const [hitboxes, setHitboxes] = useState(true);
  const [rooms, setRooms] = useState<string[]>([]);
  const [roomId, setRoomId] = useState('');
  const [tool, setTool] = useState<Tool>('paint');
  const [brush, setBrush] = useState('#');
  const [propBase, setPropBase] = useState('dungeon:woodenCrate');
  const [propDir, setPropDir] = useState<IsoDir>('S');
  const [propFilter, setPropFilter] = useState('');
  const [customChar, setCustomChar] = useState('');
  const [selectedProp, setSelectedProp] = useState('');
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [resizeW, setResizeW] = useState(10);
  const [resizeH, setResizeH] = useState(8);
  const [resizeFill, setResizeFill] = useState('.');
  const [msg, setMsg] = useState('');

  const refresh = useCallback(() => {
    const b = bridgeOf(game);
    if (!b) return;
    setRooms(b.ask({ kind: 'roomIds' }));
    const cur = roomId || b.ask({ kind: 'currentRoom' });
    if (!roomId) setRoomId(cur);
    try {
      const s = b.ask({ kind: 'editorGetRoom', roomId: cur });
      setSnap(s);
      setResizeW(s.tiles[0]?.length ?? 10);
      setResizeH(s.tiles.length);
      if (selectedProp && !s.props.some((p) => p.id === selectedProp)) setSelectedProp('');
    } catch {
      // room list not ready yet
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, roomId]);

  useEffect(() => {
    const id = window.setInterval(refresh, 700);
    const onEdit = () => refresh();
    const onSelect = (e: { propId: string }) => {
      setSelectedProp(e.propId);
      setTool('prop-edit');
    };
    game?.events.on('manor:editor', onEdit);
    game?.events.on('manor:editor-select-prop', onSelect);
    return () => {
      window.clearInterval(id);
      game?.events.off('manor:editor', onEdit);
      game?.events.off('manor:editor-select-prop', onSelect);
    };
  }, [game, refresh]);

  // push tool/brush selection into the scene
  useEffect(() => {
    if (!enabled) return;
    const b = bridgeOf(game);
    if (!b) return;
    b.send({ kind: 'editorSetTool', tool, brush: toolBrush(tool, brush, propBase, propDir) });
  }, [game, enabled, tool, brush, propBase, propDir]);

  // R = rotate facing, Del = delete selected prop (unless typing)
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotate();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedProp && snap) {
        if (snap.props.some((p) => p.id === selectedProp) && roomId) {
          e.preventDefault();
          bridgeOf(game)?.send({ kind: 'editorDeleteProp', roomId, propId: selectedProp });
          setSelectedProp('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selectedProp, snap, roomId, propDir, propBase]);

  const rotate = useCallback(() => {
    const next = NEXT_DIR[propDir];
    setPropDir(next);
    const b = bridgeOf(game);
    if (b && roomId && selectedProp && tool === 'prop-edit') {
      const sel = snap?.props.find((p) => p.id === selectedProp);
      if (sel) b.send({ kind: 'editorSetPropSprite', roomId, propId: selectedProp, sprite: propSpriteId(editorBaseDir(sel.sprite).base, next) });
    }
  }, [game, roomId, selectedProp, tool, snap, propDir]);

  const toggleEnabled = (on: boolean) => {
    const b = bridgeOf(game);
    if (!b) return;
    setEnabled(on);
    b.send({ kind: 'editorEnable', enabled: on });
    b.send({ kind: 'editorSetHitboxesVisible', visible: on && hitboxes });
    if (on) {
      b.send({ kind: 'editorSetTool', tool, brush: toolBrush(tool, brush, propBase, propDir) });
      try {
        const saved = localStorage.getItem(EDITOR_STORE_KEY);
        if (saved && b.ask({ kind: 'editorImport', json: saved })) setMsg('restored persisted edits');
      } catch {
        // ignore
      }
      refresh();
    }
  };

  const doExport = () => {
    const b = bridgeOf(game);
    if (!b) return;
    const json = b.ask({ kind: 'editorExport' });
    setExportText(json);
    try {
      localStorage.setItem(EDITOR_STORE_KEY, json);
    } catch {
      // ignore
    }
    setMsg(`exported ${JSON.parse(json).rooms.length} rooms (also stashed locally)`);
  };

  const doImport = () => {
    const b = bridgeOf(game);
    if (!b || !importText.trim()) return;
    setMsg(b.ask({ kind: 'editorImport', json: importText }) ? 'imported — room reloaded' : 'import failed: bad JSON');
    refresh();
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} copied to clipboard`);
    } catch {
      setMsg('clipboard blocked — copy manually from the box');
    }
  };

  const filteredSprites = useMemo(() => {
    const q = propFilter.trim().toLowerCase();
    return q ? CATALOG_BASES.filter((s) => s.toLowerCase().includes(q)) : [...CATALOG_BASES];
  }, [propFilter]);

  const tileUsage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of snap?.tiles ?? []) for (const ch of row) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [snap]);

  const selProp = snap?.props.find((p) => p.id === selectedProp) ?? null;
  const selParsed = selProp ? editorBaseDir(selProp.sprite) : null;

  const activeHint = TOOLS.find((t) => t.id === tool)?.hint ?? '';
  const walkOverrides = snap ? Object.keys(snap.walk).length : 0;

  const applyPropSprite = (base: string, dir: IsoDir) => {
    setPropBase(base);
    setPropDir(dir);
    if (tool === 'prop-edit' && selProp && roomId) {
      bridgeOf(game)?.send({ kind: 'editorSetPropSprite', roomId, propId: selProp.id, sprite: propSpriteId(base, dir) });
    } else {
      setTool('prop-add');
    }
  };

  return (
    <div className="le-dock">
      <div className="le-head">
        <strong>Level editor</strong>
        <span className="le-dim">iso · 1 tile = 1 sprite</span>
      </div>
      <label className="le-row">
        <input type="checkbox" checked={enabled} onChange={(e) => toggleEnabled(e.target.checked)} />
        edit mode <span className="le-dim">(movement off)</span>
      </label>
      <label className="le-row">
        <input
          type="checkbox"
          checked={hitboxes}
          onChange={(e) => {
            setHitboxes(e.target.checked);
            if (enabled) bridgeOf(game)?.send({ kind: 'editorSetHitboxesVisible', visible: e.target.checked });
          }}
        />
        hitboxes <span className="le-dim">green walk · red blocked · gold doors · blue spawn</span>
      </label>
      <div className="le-row">
        <select
          className="le-room"
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setSelectedProp('');
            bridgeOf(game)?.send({ kind: 'jumpToRoom', roomId: e.target.value });
          }}
        >
          <option value="" disabled>
            room…
          </option>
          {rooms.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="le-row">
        <button title="zoom in" onClick={() => bridgeOf(game)?.send({ kind: 'editorZoom', factor: 1.25 })}>＋</button>
        <button title="zoom out" onClick={() => bridgeOf(game)?.send({ kind: 'editorZoom', factor: 0.8 })}>－</button>
        <button title="frame room" onClick={() => bridgeOf(game)?.send({ kind: 'editorRecenter' })}>⤢ frame</button>
        <span className="le-dim">right-drag pans · wheel zooms</span>
      </div>
      {enabled && (
        <>
          <div className="le-tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={tool === t.id ? 'on' : ''}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="le-hint">{activeHint}</div>

          {/* current selection stamp — always visible while editing */}
          <div className="le-stamp">
            {tool === 'paint' ? (
              <span>
                brush <b>'{brush}'</b>{' '}
                {TILE_BRUSHES.find((b) => b.ch === brush)?.label.replace(/^.\s*/, '') ?? 'custom char'}
              </span>
            ) : tool === 'prop-add' ? (
              <span className="le-sel">
                <img src={entityThumb(propSpriteId(propBase, propDir))} alt="" width={44} height={44} />
                <span>
                  placing <b>{propBase}:{propDir}</b>
                </span>
                <button title="rotate facing (R)" onClick={rotate}>⟳ {propDir}</button>
              </span>
            ) : tool === 'prop-edit' && selProp && selParsed ? (
              <span className="le-sel">
                <img src={entityThumb(selProp.sprite)} alt="" width={44} height={44} />
                <span>
                  selected <b>{selParsed.base}:{selParsed.dir}</b> @ {selProp.x},{selProp.y}
                </span>
                <button title="rotate facing (R)" onClick={rotate}>⟳ {selParsed.dir}</button>
              </span>
            ) : (
              <span className="le-dim">
                {tool === 'prop-edit' ? 'no prop selected — click one in the canvas or list' : '—'}
              </span>
            )}
          </div>

          {(tool === 'paint' || tool === 'walk') && (
            <section>
              <h4>Tiles <span className="le-dim">✓ walk · ✕ blocked (Hitbox tool overrides)</span></h4>
              <div className="le-brushes">
                {TILE_BRUSHES.map((br) => (
                  <button
                    key={br.ch}
                    className={brush === br.ch && tool === 'paint' ? 'on' : ''}
                    onClick={() => {
                      if (tool !== 'paint') setTool('paint');
                      setBrush(br.ch);
                    }}
                    title={br.label}
                  >
                    <b>{br.ch}</b>
                    <i>{br.walkable ? '✓' : '✕'}</i>
                  </button>
                ))}
              </div>
              <div className="le-row">
                <input
                  placeholder="custom char"
                  maxLength={1}
                  value={customChar}
                  onChange={(e) => setCustomChar(e.target.value)}
                  style={{ width: 110 }}
                />
                <button
                  onClick={() => {
                    if (customChar.length === 1) {
                      setTool('paint');
                      setBrush(customChar);
                      setMsg(`custom brush '${customChar}' — paint it, then Hitbox-toggle walkability`);
                    }
                  }}
                >
                  Use char
                </button>
              </div>
              {snap && (
                <div className="le-info">
                  <div>
                    in room:{' '}
                    {tileUsage.map(([ch, n]) => (
                      <span key={ch} className="le-chip">'{ch}'×{n}</span>
                    ))}
                  </div>
                  <div className="le-row">
                    <span>{walkOverrides} walk override{walkOverrides === 1 ? '' : 's'}</span>
                    <button onClick={() => roomId && bridgeOf(game)?.send({ kind: 'editorClearWalk', roomId })}>Clear overrides</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {(tool === 'prop-add' || tool === 'prop-edit') && (
            <section>
              <h4>Sprites <span className="le-dim">click to {tool === 'prop-add' ? 'place' : 'restyle selection'} · R rotates</span></h4>
              <div className="le-row">
                {DIRS_4.map((d) => (
                  <button
                    key={d}
                    className={propDir === d ? 'on' : ''}
                    onClick={() => {
                      if (tool === 'prop-edit' && selProp && selParsed && roomId) {
                        setPropDir(d);
                        bridgeOf(game)?.send({ kind: 'editorSetPropSprite', roomId, propId: selProp.id, sprite: propSpriteId(selParsed.base, d) });
                      } else {
                        setPropDir(d);
                      }
                    }}
                  >
                    {d}
                  </button>
                ))}
                <button title="rotate facing (R)" onClick={rotate}>⟳ rotate</button>
                <input
                  placeholder="filter…"
                  value={propFilter}
                  onChange={(e) => setPropFilter(e.target.value)}
                  style={{ width: 100 }}
                />
              </div>
              <div className="le-dim">quick picks</div>
              <div className="le-grid">
                {QUICK_PACK_PROPS.map((s) => (
                  <button
                    key={s}
                    className={propBase === s ? 'on' : ''}
                    onClick={() => applyPropSprite(s, propDir)}
                    title={s}
                  >
                    <img src={entityThumb(propSpriteId(s, propDir))} alt={s} width={48} height={48} />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
              <div className="le-dim">all ({filteredSprites.length})</div>
              <div className="le-grid le-scroll">
                {filteredSprites.map((s) => (
                  <button
                    key={s}
                    className={propBase === s ? 'on' : ''}
                    onClick={() => applyPropSprite(s, propDir)}
                    title={`${s}:${propDir}`}
                  >
                    <img src={entityThumb(propSpriteId(s, propDir))} alt={s} width={48} height={48} />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {snap && (tool === 'prop-edit' || tool === 'prop-delete' || tool === 'prop-add') && (
            <section>
              <h4>Placed props ({snap.props.length})</h4>
              {selProp && selParsed && (
                <div className="le-card">
                  <img src={entityThumb(selProp.sprite)} alt="" width={72} height={72} />
                  <div>
                    <div><b>{selParsed.base}:{selParsed.dir}</b> @ {selProp.x},{selProp.y}</div>
                    <div className="le-row">
                      <button
                        onClick={() => roomId && bridgeOf(game)?.send({ kind: 'editorSetPropWalk', roomId, propId: selProp.id, walkable: !selProp.walkable })}
                      >
                        {selProp.walkable ? 'walkable → block' : 'blocked → walk'}
                      </button>
                      <button title="rotate facing (R)" onClick={rotate}>⟳ rotate</button>
                      <button
                        onClick={() => {
                          if (roomId) bridgeOf(game)?.send({ kind: 'editorDeleteProp', roomId, propId: selProp.id });
                          setSelectedProp('');
                        }}
                      >
                        ✕ delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="le-list">
                {snap.props.map((pr) => {
                  const parsed = editorBaseDir(pr.sprite);
                  return (
                    <button
                      key={pr.id}
                      className={selectedProp === pr.id ? 'on' : ''}
                      onClick={() => {
                        setSelectedProp(pr.id);
                        setTool('prop-edit');
                        setPropBase(parsed.base);
                        setPropDir(parsed.dir);
                      }}
                      title="select for editing"
                    >
                      <img src={entityThumb(pr.sprite)} alt="" width={28} height={28} />
                      <span>{parsed.base}:{parsed.dir} @ {pr.x},{pr.y} {pr.walkable ? '✓' : '✕'}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {snap && (
            <section>
              <h4>Doors / portals ({snap.portals.length})</h4>
              <button onClick={() => roomId && bridgeOf(game)?.send({ kind: 'editorAddPortal', roomId })}>＋ Add door at spawn</button>
              {snap.portals.map((p, i) => (
                <div key={i} className="le-portal">
                  <div className="le-row">
                    <b>#{i}</b>
                    <span>({p.from.x},{p.from.y}) →</span>
                    <select
                      value={p.toRoom}
                      onChange={(e) => bridgeOf(game)?.send({ kind: 'editorUpdatePortal', roomId, index: i, patch: { toRoom: e.target.value } })}
                    >
                      {rooms.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <button onClick={() => bridgeOf(game)?.send({ kind: 'editorDeletePortal', roomId, index: i })}>✕</button>
                  </div>
                  <div className="le-row">
                    <label>to x <input type="number" value={p.to.x} onChange={(e) => bridgeOf(game)?.send({ kind: 'editorUpdatePortal', roomId, index: i, patch: { toX: Number(e.target.value) } })} /></label>
                    <label>to y <input type="number" value={p.to.y} onChange={(e) => bridgeOf(game)?.send({ kind: 'editorUpdatePortal', roomId, index: i, patch: { toY: Number(e.target.value) } })} /></label>
                  </div>
                  <div className="le-row">
                    <input
                      placeholder="label"
                      value={p.label ?? ''}
                      onChange={(e) => bridgeOf(game)?.send({ kind: 'editorUpdatePortal', roomId, index: i, patch: { label: e.target.value } })}
                    />
                    <select
                      value={p.lockedBy ?? ''}
                      onChange={(e) => bridgeOf(game)?.send({ kind: 'editorUpdatePortal', roomId, index: i, patch: { lockedBy: e.target.value as LockKey | '' } })}
                    >
                      <option value="">unlocked</option>
                      <option value="servant">servant</option>
                      <option value="master">master</option>
                      <option value="kitchen">kitchen</option>
                    </select>
                    <button onClick={() => bridgeOf(game)?.send({ kind: 'jumpToRoom', roomId: p.toRoom })}>go →</button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {snap && (
            <section>
              <h4>Room</h4>
              <div className="le-dim">
                {snap.tiles[0]?.length}×{snap.tiles.length} · spawn ({snap.spawn.x},{snap.spawn.y})
              </div>
              <div className="le-row">
                <label>w <input type="number" value={resizeW} onChange={(e) => setResizeW(Number(e.target.value))} /></label>
                <label>h <input type="number" value={resizeH} onChange={(e) => setResizeH(Number(e.target.value))} /></label>
                <input value={resizeFill} maxLength={1} onChange={(e) => setResizeFill(e.target.value)} title="fill char" />
                <button onClick={() => roomId && bridgeOf(game)?.send({ kind: 'editorResize', roomId, w: resizeW, h: resizeH, fill: resizeFill || '.' })}>
                  Resize
                </button>
              </div>
            </section>
          )}

          <section>
            <h4>Export</h4>
            <div className="le-row">
              <button onClick={doExport}>Export JSON</button>
              <button
                onClick={() => {
                  const src = exportText || bridgeOf(game)?.ask({ kind: 'editorExport' }) || '';
                  if (!src) {
                    setMsg('nothing to convert yet');
                    return;
                  }
                  try {
                    void copy(exportToManorTs(src), 'manor.ts');
                  } catch {
                    setMsg('convert failed — export valid JSON first');
                  }
                }}
              >
                Copy manor.ts
              </button>
            </div>
            {msg && <div className="le-hint">{msg}</div>}
            {exportText && <textarea readOnly rows={6} value={exportText} onFocus={(e) => e.target.select()} />}
            <textarea
              rows={3}
              placeholder="paste export JSON to re-apply…"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="le-row">
              <button onClick={doImport}>Apply import</button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem(EDITOR_STORE_KEY);
                  } catch {
                    // ignore
                  }
                  setMsg('persisted edits cleared (reload for pristine rooms)');
                }}
              >
                Clear stash
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
