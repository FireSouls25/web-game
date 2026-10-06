/**
 * Minimal text-engine stub. Queues lines for the dialogue box.
 * LLM-driven dynamic text (per-character context) plugs in here later.
 */
export interface TextLine {
  speaker: string;
  text: string;
}

/**
 * Minimal dialogue seam used by scenes. Satisfied by {@link TextEngine};
 * fakes in tests only need these members.
 */
export interface Dialogue {
  say(speaker: string, text: string): void;
  current(): TextLine | undefined;
  on(fn: () => void): () => void;
}

export class TextEngine implements Dialogue {
  private queue: TextLine[] = [];
  private listeners = new Set<() => void>();

  say(speaker: string, text: string): void {
    this.queue.push({ speaker, text });
    this.emit();
  }

  current(): TextLine | undefined {
    return this.queue[0];
  }

  advance(): void {
    this.queue.shift();
    this.emit();
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const textEngine = new TextEngine();
