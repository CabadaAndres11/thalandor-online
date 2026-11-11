import { t } from '../i18n';

export interface MenuHandlers {
  onPlay(name: string): void;
  onJoin(name: string, code: string): void;
}

export interface GameUiOptions {
  isHost: boolean;
  /** Opens the group to the network and resolves with the room code. */
  onOpenGroup: () => Promise<string>;
  onChat: (text: string) => void;
  onLeave: () => void;
}

const NAME_KEY = 'thalandor.name';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage unavailable: ignore */
  }
}

/**
 * HTML layer over the canvas: menu, group button and chat.
 * All player-provided text is inserted with textContent, never innerHTML.
 */
export class Overlay {
  private readonly menu = el('div', 'menu');
  private readonly hud = el('div', 'hud');
  private readonly chat = el('div', 'chat');
  private readonly chatLog = el('div', 'chat-log');
  private readonly chatInput = el('input', 'chat-input');
  private readonly playBtn = el('button', 'btn primary', t('menu.play'));
  private readonly joinBtn = el('button', 'btn', t('menu.join'));
  private readonly nameInput = el('input', 'field');
  private readonly codeInput = el('input', 'field code');
  private readonly menuError = el('p', 'error');
  private game: GameUiOptions | null = null;
  private chatIsOpen = false;

  constructor(root: HTMLElement, version: string) {
    this.buildMenu(version);
    this.chatInput.placeholder = t('chat.placeholder');
    this.chatInput.maxLength = 200;
    this.chat.append(this.chatLog, this.chatInput);
    root.append(this.menu, this.hud, this.chat);
    this.hideGame();
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  get chatOpen(): boolean {
    return this.chatIsOpen;
  }

  showMenu(h: MenuHandlers, error?: string): void {
    this.hideGame();
    this.menu.hidden = false;
    this.setMenuBusy(false);
    this.menuError.textContent = error ?? '';
    this.playBtn.onclick = () => h.onPlay(this.currentName());
    this.joinBtn.onclick = () => h.onJoin(this.currentName(), this.codeInput.value);
    this.codeInput.onkeydown = (e) => {
      if (e.key === 'Enter') h.onJoin(this.currentName(), this.codeInput.value);
    };
  }

  setMenuError(msg: string): void {
    this.menuError.textContent = msg;
  }

  setMenuBusy(busy: boolean): void {
    this.playBtn.disabled = busy;
    this.joinBtn.disabled = busy;
    this.joinBtn.textContent = busy ? t('menu.connecting') : t('menu.join');
  }

  showGame(opts: GameUiOptions): void {
    this.game = opts;
    this.menu.hidden = true;
    this.hud.hidden = false;
    this.chat.hidden = false;
    this.chatLog.replaceChildren();
    this.hud.replaceChildren();
    if (opts.isHost) this.hud.append(this.groupButton(opts));
    const leave = el('button', 'btn small', t('game.leave'));
    leave.onclick = () => opts.onLeave();
    this.hud.append(leave);
  }

  addChat(from: string | null, text: string): void {
    const line = el('div', from === null ? 'chat-line system' : 'chat-line');
    if (from !== null) line.append(el('span', 'chat-from', `${from}: `));
    line.append(document.createTextNode(text));
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 50) this.chatLog.firstElementChild?.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private hideGame(): void {
    this.game = null;
    this.closeChat();
    this.hud.hidden = true;
    this.chat.hidden = true;
  }

  private currentName(): string {
    const name = this.nameInput.value.trim();
    saveName(name);
    return name;
  }

  private buildMenu(version: string): void {
    const card = el('div', 'card');
    const label = (text: string, input: HTMLInputElement) => {
      const l = el('label', 'label', text);
      l.append(input);
      return l;
    };
    this.nameInput.maxLength = 16;
    this.nameInput.value = loadName();
    this.nameInput.autocomplete = 'off';
    this.codeInput.maxLength = 8;
    this.codeInput.autocomplete = 'off';
    this.codeInput.placeholder = 'ABC234';
    card.append(
      el('h1', 'title', t('menu.title')),
      label(t('menu.name'), this.nameInput),
      this.playBtn,
      el('div', 'or', t('menu.or')),
      label(t('menu.code'), this.codeInput),
      this.joinBtn,
      this.menuError,
    );
    this.menu.append(card, el('div', 'version', t('menu.version', { version })));
  }

  private groupButton(opts: GameUiOptions): HTMLButtonElement {
    const btn = el('button', 'btn small', t('game.openGroup'));
    btn.dataset.testid = 'group';
    btn.onclick = async () => {
      if (btn.dataset.code) {
        try {
          await navigator.clipboard.writeText(btn.dataset.code);
          btn.textContent = t('game.copied');
          setTimeout(() => (btn.textContent = t('game.groupCode', { code: btn.dataset.code! })), 1200);
        } catch {
          /* clipboard blocked: the code is visible anyway */
        }
        return;
      }
      btn.disabled = true;
      btn.textContent = t('game.openingGroup');
      try {
        const code = await opts.onOpenGroup();
        btn.dataset.code = code;
        btn.textContent = t('game.groupCode', { code });
      } catch {
        btn.textContent = t('game.openGroup');
        this.addChat(null, t('error.openGroup'));
      } finally {
        btn.disabled = false;
      }
    };
    return btn;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.game) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!this.chatIsOpen) return this.openChat();
      const text = this.chatInput.value.trim();
      if (text) this.game.onChat(text);
      this.closeChat();
    } else if (e.key === 'Escape' && this.chatIsOpen) {
      this.closeChat();
    }
  }

  private openChat(): void {
    this.chatIsOpen = true;
    this.chat.classList.add('open');
    this.chatInput.value = '';
    this.chatInput.focus();
  }

  private closeChat(): void {
    this.chatIsOpen = false;
    this.chat.classList.remove('open');
    this.chatInput.value = '';
    this.chatInput.blur();
  }
}
