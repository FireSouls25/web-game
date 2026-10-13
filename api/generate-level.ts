/**
 * Vercel Function: GET /api/generate-level?theme=dungeon&depth=1&seed=42
 *
 * Same Vercel project/dashboard as the static Vite site — files under
 * api/ deploy as serverless functions on Fluid compute. The game bundle
 * never includes this code or the API key.
 *
 * Difficulty (theme/size/budgets/archetype/par) is decided by the
 * deterministic curve in src/level/difficulty.ts. The model only fills
 * in the layout within those budgets; validateLevel enforces every
 * hard constraint and triggers one repair attempt before we fall back
 * to the offline generator — gameplay never blocks on the model.
 *
 * Env (Vercel dashboard → Settings → Environment Variables):
 *   AI_API_KEY or OPENAI_API_KEY or AI_GATEWAY_API_KEY (any one enables AI)
 *   AI_BASE_URL (default https://api.openai.com/v1; use the AI Gateway
 *     URL when routing through Vercel AI Gateway)
 *   AI_MODEL (default gpt-4o-mini)
 *
 * Local test without cloud: `npm run level:lab` (no key, no network).
 * Local AI test: point AI_BASE_URL at Ollama (http://localhost:11434/v1,
 * AI_API_KEY=ollama) and `vercel dev`, or POST a mock file through the
 * lab's --mock-file flag.
 */

import { difficultyFor } from '../src/level/difficulty';
import { fallbackLevel } from '../src/level/fallback';
import { validateLevel } from '../src/level/validate';
import { designLevelWithAi, providerFromEnv } from '../src/level/aiLevel';
import type { LevelTheme } from '../src/level/types';

function num(q: string | null, def: number, lo: number, hi: number): number {
  const n = q === null ? NaN : Number(q);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function themeOf(q: string | null): LevelTheme | undefined {
  if (q === 'dungeon' || q === 'library' || q === 'farm' || q === 'base') return q;
  return undefined;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const depth = num(url.searchParams.get('depth'), 1, 1, 20);
  const seed = num(url.searchParams.get('seed'), Date.now() % 100000, 0, 2 ** 31 - 1);
  const difficulty = difficultyFor(depth, themeOf(url.searchParams.get('theme')));
  const width = num(url.searchParams.get('width'), difficulty.width, 0, 24);
  const height = num(url.searchParams.get('height'), difficulty.height, 0, 24);
  difficulty.width = width >= 9 ? width : difficulty.width;
  difficulty.height = height >= 9 ? height : difficulty.height;

  const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env ?? {};
  const mock = url.searchParams.get('mock') === '1';
  const provider = mock ? null : providerFromEnv(env);

  if (provider) {
    try {
      const r = await designLevelWithAi(difficulty, seed, provider);
      return Response.json({ source: 'ai', difficulty, ...r });
    } catch (e) {
      const warnings = [e instanceof Error ? e.message : String(e)];
      const level = fallbackLevel({ seed, theme: difficulty.theme, depth });
      const v = validateLevel(level, depth);
      if (!v.ok) return Response.json({ source: 'fallback', errors: v.errors }, { status: 500 });
      return Response.json({ source: 'fallback', difficulty, level, warnings });
    }
  }

  const level = fallbackLevel({
    seed,
    theme: difficulty.theme,
    depth,
    width: difficulty.width,
    height: difficulty.height,
  });
  const v = validateLevel(level, depth);
  if (!v.ok) return Response.json({ source: 'fallback', errors: v.errors }, { status: 500 });
  return Response.json({
    source: 'fallback',
    difficulty,
    level,
    warnings: mock
      ? []
      : ['no AI key configured — set AI_API_KEY in Vercel env to enable AI layouts'],
  });
}
