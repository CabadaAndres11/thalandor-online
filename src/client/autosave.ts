import type { Character } from '../save/character';
import type { CharacterStore } from '../save/store';
import type { ProgressInfo } from '../sim/progression/requests';

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

/** Writes the character's last location (periodically) and progress (when the host sends it) to local storage. */
export class AutoSaver {
  private timer: ReturnType<typeof setInterval> | undefined;
  private character: Character;
  private readonly now: () => number;
  /** Saves run one after another: two read-patch-writes must never interleave and undo each other. */
  private queue: Promise<void> = Promise.resolve();

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

  saveNow(): Promise<void> {
    const loc = this.opts.getLocation();
    if (!loc) return this.queue;
    return this.patch({ lastLocation: { mapId: this.opts.mapId, x: loc.x, y: loc.y } });
  }

  /** Stores level, experience and choices exactly as the host reports them. */
  saveProgress(p: ProgressInfo): Promise<void> {
    return this.patch({
      level: p.level,
      xp: p.xp,
      attributes: { ...p.attributes },
      talents: { ...p.talents },
      specId: p.specId,
      hotbar: [...p.hotbar],
    });
  }

  private patch(changes: Partial<Character>): Promise<void> {
    this.queue = this.queue.then(async () => {
      try {
        // Read-patch-write: another tab may have deleted or replaced (imported) this character meanwhile.
        const stored = await this.opts.store.get(this.character.id);
        if (!stored) return;
        this.character = { ...stored, ...changes, updatedAt: this.now() };
        await this.opts.store.put(this.character);
      } catch (e) {
        console.warn('[autosave] could not save character', e);
      }
    });
    return this.queue;
  }
}
