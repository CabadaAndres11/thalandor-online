import { t } from '../i18n';
import { el } from './dom';

export interface GameUiOptions {
  isHost: boolean;
  /** Opens the group to the network and resolves with the room code. */
  onOpenGroup: () => Promise<string>;
  onChat: (text: string) => void;
  onLeave: () => void;
}

/**
 * In-game HTML layer over the canvas: group button, leave button and chat.
 * All player-provided text is inserted with textContent, never innerHTML.
 */
export class Overlay {
  private readonly hud = el('div', 'hud');
  private readonly chat = el('div', 'chat');
  private readonly chatLog = el('div', 'chat-log');
  private readonly chatInput = el('input', 'chat-input');
  private game: GameUiOptions | null = null;
  private chatIsOpen = false;

  constructor(root: HTMLElement) {
    this.chatInput.placeholder = t('chat.placeholder');
    this.chatInput.maxLength = 200;
    this.chat.append(this.chatLog, this.chatInput);
    root.append(this.hud, this.chat);
    this.hide();
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  get chatOpen(): boolean {
    return this.chatIsOpen;
  }

  show(opts: GameUiOptions): void {
    this.game = opts;
    this.hud.hidden = false;
    this.chat.hidden = false;
    this.chatLog.replaceChildren();
    this.hud.replaceChildren();
    if (opts.isHost) this.hud.append(this.groupButton(opts));
    const leave = el('button', 'btn small', t('game.leave'));
    leave.onclick = () => opts.onLeave();
    this.hud.append(leave);
  }

  hide(): void {
    this.game = null;
    this.closeChat();
    this.hud.hidden = true;
    this.chat.hidden = true;
  }

  addChat(from: string | null, text: string): void {
    const line = el('div', from === null ? 'chat-line system' : 'chat-line');
    if (from !== null) line.append(el('span', 'chat-from', `${from}: `));
    line.append(document.createTextNode(text));
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 50) this.chatLog.firstElementChild?.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
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
      e.preventDefault();
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
