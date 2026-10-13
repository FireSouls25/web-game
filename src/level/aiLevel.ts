import type { LevelDef } from './types';
import type { Difficulty } from './difficulty';
import { buildLevelPrompt, buildRepairPrompt } from './prompt';
import { validateLevel } from './validate';

/**
 * AI I/O boundary: structural normalization + provider call +
 * validate-and-repair orchestration. Pure except for the injected
 * fetch — the api route passes global fetch, the lab script passes
 * a stub, so the whole loop is testable without Vercel or a key.
 */

export class AiError extends Error {}

export interface AiProvider {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function providerFromEnv(env: Record<string, string | undefined>): AiProvider | null {
  const apiKey = env['AI_GATEWAY_API_KEY'] ?? env['OPENAI_API_KEY'] ?? env['AI_API_KEY'];
  if (!apiKey) return null;
  return {
    baseUrl: env['AI_BASE_URL'] ?? 'https://api.openai.com/v1',
    apiKey,
    model: env['AI_MODEL'] ?? 'gpt-4o-mini',
  };
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function pos(v: unknown): v is { x: number; y: number } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isInt(o['x']) && isInt(o['y']);
}

/** Structural check of raw model JSON. Semantic rules stay in validateLevel. */
export function normalizeAiLevel(raw: unknown, seed: number): { level: LevelDef; issues: string[] } {
  const issues: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { level: raw as LevelDef, issues: ['root: not an object'] };
  }
  const o = raw as Record<string, unknown>;
  const theme = o['theme'];
  if (theme !== 'dungeon' && theme !== 'library' && theme !== 'farm' && theme !== 'base') {
    issues.push('theme: must be dungeon|library|farm|base');
  }
  const tiles = o['tiles'];
  if (!Array.isArray(tiles) || tiles.length === 0 || !tiles.every((r) => typeof r === 'string')) {
    issues.push('tiles: must be a non-empty string array');
  }
  if (!pos(o['spawn'])) issues.push('spawn: must be {x,y} integers');
  if (!pos(o['exit'])) issues.push('exit: must be {x,y} integers');
  const pickups = o['pickups'];
  if (!Array.isArray(pickups)) issues.push('pickups: must be an array');
  else {
    pickups.forEach((p, i) => {
      const r = p as Record<string, unknown>;
      if (typeof r['id'] !== 'string' || !pos({ x: r['x'], y: r['y'] }) || typeof r['sprite'] !== 'string') {
        issues.push(`pickups[${i}]: need {id string, x int, y int, sprite string}`);
      } else if (!(r['sprite'] as string).includes(':')) {
        issues.push(`pickups[${i}]: sprite must be pack-qualified`);
      }
    });
  }
  const enemies = o['enemies'];
  if (!Array.isArray(enemies)) issues.push('enemies: must be an array');
  else {
    enemies.forEach((e, i) => {
      const r = e as Record<string, unknown>;
      if (typeof r['id'] !== 'string' || (r['kind'] !== 'chaser' && r['kind'] !== 'patrol') || !pos({ x: r['x'], y: r['y'] })) {
        issues.push(`enemies[${i}]: need {id string, kind chaser|patrol, x int, y int}`);
      }
      if (r['kind'] === 'patrol') {
        const path = r['path'];
        if (!Array.isArray(path) || path.length < 2 || !path.every(pos)) {
          issues.push(`enemies[${i}]: patrol needs path of >= 2 {x,y}`);
        }
      }
      if (r['tempo'] !== undefined && (!Number.isInteger(r['tempo']) || (r['tempo'] as number) < 1 || (r['tempo'] as number) > 3)) {
        issues.push(`enemies[${i}]: tempo must be 1..3`);
      }
    });
  }
  const props = o['props'];
  if (!Array.isArray(props)) issues.push('props: must be an array');
  else {
    props.forEach((p, i) => {
      const r = p as Record<string, unknown>;
      const fp = r['footprint'];
      if (
        typeof r['id'] !== 'string' ||
        typeof r['sprite'] !== 'string' ||
        !pos(r['anchor']) ||
        !Array.isArray(fp) ||
        fp.length === 0 ||
        fp.length > 6 ||
        !fp.every(pos) ||
        typeof r['blocksMovement'] !== 'boolean'
      ) {
        issues.push(`props[${i}]: need {id, sprite, anchor {x,y}, footprint 1-6 {x,y}, blocksMovement bool}`);
      }
    });
  }
  const level = {
    id: typeof o['id'] === 'string' && o['id'].length > 0 ? o['id'] : `ai-${seed}`,
    theme: o['theme'],
    tiles: o['tiles'],
    spawn: o['spawn'],
    exit: o['exit'],
    pickups: o['pickups'],
    enemies: o['enemies'],
    props: o['props'],
    par: typeof o['par'] === 'number' ? o['par'] : undefined,
  } as unknown as LevelDef;
  return { level, issues };
}

/** Strip markdown fences / prose around the JSON payload. */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = (fence ? fence[1] : text).trim();
  const start = src.search(/[{[]/);
  if (start < 0) throw new AiError('response: no JSON found');
  return JSON.parse(src.slice(start));
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** One OpenAI-compatible chat-completions call returning parsed JSON. */
export async function completeJson(
  provider: AiProvider,
  messages: ChatMessage[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 30000,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new AiError(`request failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AiError(`provider ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AiError('response: empty choices');
  try {
    return extractJson(content);
  } catch {
    throw new AiError('response: invalid JSON');
  }
}

export interface AiGenResult {
  level: LevelDef;
  warnings: string[];
  repaired: boolean;
}

/**
 * Full design loop: prompt -> complete -> normalize -> validate,
 * with ONE repair attempt carrying the validator errors. Throws
 * AiError when both attempts fail; the caller falls back to the
 * deterministic generator so gameplay never blocks on the model.
 */
export async function designLevelWithAi(
  difficulty: Difficulty,
  seed: number,
  provider: AiProvider,
  fetchImpl: typeof fetch = fetch,
): Promise<AiGenResult> {
  const prompt = buildLevelPrompt(difficulty, seed);
  const first = await completeJson(
    provider,
    [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    fetchImpl,
  );
  const n1 = normalizeAiLevel(first, seed);
  const v1 = n1.issues.length > 0 ? null : validateLevel(n1.level, difficulty.depth);
  if (v1?.ok) return { level: n1.level, warnings: [], repaired: false };

  const problems = [...n1.issues, ...(v1 ? v1.errors : [])];
  const repair = buildRepairPrompt(JSON.stringify(first).slice(0, 6000), problems);
  const second = await completeJson(
    provider,
    [
      { role: 'system', content: prompt.system },
      { role: 'user', content: `${prompt.user}\n\n${repair}` },
    ],
    fetchImpl,
  );
  const n2 = normalizeAiLevel(second, seed);
  const v2 = n2.issues.length > 0 ? null : validateLevel(n2.level, difficulty.depth);
  if (v2?.ok) return { level: n2.level, warnings: problems, repaired: true };
  throw new AiError(`unfixable level: ${[...n2.issues, ...(v2 ? v2.errors : [])].join('; ').slice(0, 500)}`);
}
