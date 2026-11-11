import type { Character } from '../save/character';
import type { CharacterStore } from '../save/store';

export const AUTOSAVE_INTERVAL_MS = 30_000;

export interface AutoSaverOptions {
  store: CharacterStore;
  character: Character;
  mapId: string;
  /** The host's authoritative position for the local player, or null if unknown yet. */
  getLocation: () => { x: number; y: number } | null;
  now?: () => number;
  intervalMs?: number;
}

/** Periodically writes the character's last location back to local storage. */
export class AutoSaver {
  private timer: ReturnType<typeof setInterval> | undefined;
  private character: Character;
  private readonly now: () => number;

  constructor(private readonly opts: AutoSaverOptions) {
    this.character = opts.character;
    this.now = opts.now ?? Date.now;
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => void this.saveNow(), this.opts.intervalMs ?? AUTOSAVE_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async saveNow(): Promise<void> {
    const loc = this.opts.getLocation();
    if (!loc) return;
    this.character = { ...this.character, lastLocation: { mapId: this.opts.mapId, x: loc.x, y: loc.y }, updatedAt: this.now() };
    try {
      await this.opts.store.put(this.character);
    } catch (e) {
      console.warn('[autosave] could not save character', e);
    }
  }
}
