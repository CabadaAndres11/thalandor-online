import es from '../../data/i18n/es.json';

const texts: Record<string, string> = es;
const warned = new Set<string>();

/** Looks up a UI text by key and fills `{var}` placeholders. Missing keys return the key itself. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const text = texts[key];
  if (text === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    return key;
  }
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}
