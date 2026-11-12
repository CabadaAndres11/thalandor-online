import { t } from '../i18n';
import { button, el } from './dom';

export interface PauseMenuOptions {
  /** Whether the world really stops (solo host) or keeps running (group or guest). */
  freezes: () => boolean;
  onPause: (paused: boolean) => void;
  onCharacter: () => void;
  onTalents: () => void;
  onLeave: () => void;
  /** True while something else uses Escape (chat, game windows). */
  busy: () => boolean;
}

/** Esc menu. Pauses the world in a solo game; in a group the game keeps running underneath. */
export class PauseMenu {
  private readonly root = el('div', 'game-window pause-menu');
  private readonly note = el('div', 'muted');
  private readonly onKey = (e: KeyboardEvent) => this.key(e);
  private isOpen = false;

  constructor(
    parent: HTMLElement,
    private readonly opts: PauseMenuOptions,
  ) {
    const list = el('div', 'pause-actions');
    list.append(
      button('btn primary', t('pause.resume'), () => this.close()),
      button('btn', t('pause.character'), () => {
        this.close();
        opts.onCharacter();
      }),
      button('btn', t('pause.talents'), () => {
        this.close();
        opts.onTalents();
      }),
      button('btn danger', t('pause.leave'), () => {
        this.close();
        opts.onLeave();
      }),
    );
    this.root.append(el('h2', 'win-title', t('pause.title')), this.note, list);
    this.root.dataset.window = 'pause';
    this.root.hidden = true;
    parent.append(this.root);
    document.addEventListener('keydown', this.onKey);
  }

  get open(): boolean {
    return this.isOpen;
  }

  show(): void {
    this.isOpen = true;
    this.note.textContent = this.opts.freezes() ? t('pause.frozen') : t('pause.running');
    this.root.hidden = false;
    this.opts.onPause(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this.opts.onPause(false);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
    if (this.isOpen) this.opts.onPause(false);
    this.root.remove();
  }

  private key(e: KeyboardEvent): void {
    if (e.code !== 'Escape' || e.defaultPrevented) return;
    if (this.isOpen) this.close();
    else if (!this.opts.busy()) this.show();
    else return;
    e.preventDefault();
  }
}
