import { MAX_CHARACTERS, NAME_MAX, parseCharacter, validateName, type Character, type ParseError } from './character';

export type ImportPlan =
  | { kind: 'add'; character: Character }
  | { kind: 'replace'; character: Character }
  | { kind: 'error'; error: ParseError | 'import.full' };

/** Decides what importing `raw` would do, without touching storage. */
export function planImport(raw: unknown, existing: Character[]): ImportPlan {
  const parsed = parseCharacter(raw);
  if (!parsed.ok) return { kind: 'error', error: parsed.error };
  const c = parsed.character;
  if (existing.some((e) => e.id === c.id)) return { kind: 'replace', character: c };
  if (existing.length >= MAX_CHARACTERS) return { kind: 'error', error: 'import.full' };
  const names = existing.map((e) => e.name);
  if (validateName(c.name, names).ok) return { kind: 'add', character: c };
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const base = [...c.name].slice(0, NAME_MAX - suffix.length).join('').trimEnd();
    const candidate = validateName(base + suffix, names);
    if (candidate.ok) return { kind: 'add', character: { ...c, name: candidate.name } };
  }
}

export function exportFileName(c: Character): string {
  const safe = c.name.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
  return `thalandor-${safe}.json`;
}

/** Browser-only: downloads the character as a JSON file. */
export function downloadCharacter(c: Character): void {
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(c);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Browser-only: reads a chosen file as JSON; null when it is not valid JSON. */
export async function readCharacterFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    return null;
  }
}
