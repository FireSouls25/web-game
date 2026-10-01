export interface DiaryEntry {
  id: string;
  loop: number;
  text: string;
}

/**
 * Player knowledge that persists across loop resets.
 * NPC/world state resets; this store does not (until the player clears it).
 */
export class DiaryStore {
  private entries: DiaryEntry[] = [];
  private listeners = new Set<() => void>();

  add(loop: number, text: string): DiaryEntry {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, loop, text };
    this.entries.push(entry);
    this.emit();
    return entry;
  }

  all(): DiaryEntry[] {
    return [...this.entries];
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const diaryStore = new DiaryStore();
