/**
 * Production save file (localStorage). Drives the main-menu "Continue" option.
 * Written automatically by GameScene after every move / room change.
 */
export interface SaveData {
  version: 1;
  roomId: string;
  tile: { x: number; y: number };
  elapsedMinutes: number;
  loops: number;
  savedAt: number;
}

const KEY = 'manor-loop-save-v1';

export function hasSave(): boolean {
  return loadSave() !== null;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1 || !data.roomId || !data.tile) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(s: Omit<SaveData, 'version' | 'savedAt'>): void {
  try {
    const data: SaveData = { ...s, version: 1, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full / private mode — the game still runs, just no Continue.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
