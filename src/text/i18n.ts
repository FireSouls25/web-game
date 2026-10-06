/**
 * Minimal EN/ES internationalization for all player-facing text.
 * The game title ("Mansion Mystery") is intentionally NOT translated.
 *
 * Language is chosen in the menu settings page, persisted to localStorage,
 * and read at `say()` time by GameScene (the game boots after the menu,
 * so no live re-render inside Phaser is needed). React UI uses `useLang()`.
 *
 * DEV-only panels (DevTools / LevelEditor) stay in English on purpose.
 */

import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'es';

const STORE_KEY = 'mansion-mystery-lang';

type Dict = Record<string, string>;

const en: Dict = {
  'menu.over': 'Anno 1897 · somewhere in England',
  'menu.sub': 'A Victorian time-loop mystery — prototype',
  'menu.new': 'New game',
  'menu.continue': 'Continue',
  'menu.credits': 'Credits',
  'menu.settings': 'Settings',
  'menu.fullscreen': 'Fullscreen',
  'menu.back': 'Back',
  'menu.foot': 'Move: WASD / arrows · Esc returns here · progress autosaves in this browser',
  'menu.controls': 'Up = north · Right = east · Down = south · Left = west',
  'credits.heading': 'Credits',
  'credits.art': 'Prototype art — Kenney · Prototype Pack',
  'credits.cc0': 'Free for personal, educational and commercial projects. Credited here with thanks (not mandatory under CC0).',
  'credits.tag': 'A time-loop mystery in a Victorian manor. Prototype — more to come.',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.note': 'The title stays in English.',
  'lock.servant': "Locked. The servants' room — Clara's key would open it.",
  'lock.master': 'Locked. It needs the master key.',
  'lock.kitchen': 'Locked. Thomas keeps the kitchen key.',
  'chime.speaker': 'Great clock',
  'chime.text': 'It chimes twelve — day {day}. The sound comes from everywhere at once.',
};

const es: Dict = {
  'menu.over': 'Anno 1897 · en algún lugar de Inglaterra',
  'menu.sub': 'Un misterio victoriano con bucle temporal — prototipo',
  'menu.new': 'Nueva partida',
  'menu.continue': 'Continuar',
  'menu.credits': 'Créditos',
  'menu.settings': 'Ajustes',
  'menu.fullscreen': 'Pantalla completa',
  'menu.back': 'Volver',
  'menu.foot': 'Mover: WASD / flechas · Esc vuelve aquí · el progreso se guarda en este navegador',
  'menu.controls': 'Arriba = norte · Derecha = este · Abajo = sur · Izquierda = oeste',
  'credits.heading': 'Créditos',
  'credits.art': 'Arte del prototipo — Kenney · Prototype Pack',
  'credits.cc0': 'Gratis para proyectos personales, educativos y comerciales. Agradecido aquí con mención (no obligatorio bajo CC0).',
  'credits.tag': 'Un misterio con bucle temporal en una mansión victoriana. Prototipo — más por venir.',
  'settings.title': 'Ajustes',
  'settings.language': 'Idioma',
  'settings.note': 'El título no se traduce.',
  'lock.servant': 'Cerrado. El cuarto de los sirvientes — la llave de Clara lo abriría.',
  'lock.master': 'Cerrado. Necesita la llave maestra.',
  'lock.kitchen': 'Cerrado. Thomas guarda la llave de la cocina.',
  'chime.speaker': 'Gran reloj',
  'chime.text': 'Dan las doce — día {day}. El sonido viene de todas partes a la vez.',
};

const STRINGS: Record<Lang, Dict> = { en, es };

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
    if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es')) {
      return 'es';
    }
  } catch {
    // storage unavailable — fall through to default
  }
  return 'en';
}

let lang: Lang = detect();
const listeners = new Set<() => void>();

function applyHtmlLang(): void {
  try {
    document.documentElement.lang = lang;
  } catch {
    // non-DOM environment (tests) — ignore
  }
}

applyHtmlLang();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    // storage unavailable — session-only language
  }
  applyHtmlLang();
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook — re-renders the component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => lang);
}

/** Translate a key, interpolating {vars}. Falls back to English, then the key. */
export function tr(key: string, vars?: Record<string, string | number>): string {
  const dict = STRINGS[lang];
  let s = dict[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
