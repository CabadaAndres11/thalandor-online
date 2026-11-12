import { CATALOG, CLASS_IDS, defaultAppearance, type Appearance, type ClassId } from '../../appearance/catalog';
import { createCharacter, MAX_CHARACTERS, validateName, type Character } from '../../save/character';
import type { CharacterStore } from '../../save/store';
import { downloadCharacter, planImport, readCharacterFile } from '../../save/transfer';
import { t } from '../i18n';
import { PreviewCanvas } from '../render/preview';
import { equipmentLooks } from '../../sim/items/stats';
import { button, el, prefs } from './dom';

export interface ScreenHandlers {
  onPlay(c: Character): void;
  onJoin(c: Character, code: string): void;
}

const LAST_SELECTED = 'thalandor.selected';

/** Character selection and creation screens (HTML over the game canvas). */
export class Screens {
  private readonly root = el('div', 'screens');
  private readonly error = el('p', 'error');
  private previews: PreviewCanvas[] = [];
  private busy = false;
  private selectedId: string | null = prefs.get(LAST_SELECTED);
  private busyButtons: HTMLButtonElement[] = [];

  constructor(
    parent: HTMLElement,
    private readonly store: CharacterStore,
    private readonly handlers: ScreenHandlers,
    private readonly version: string,
  ) {
    this.error.dataset.testid = 'screen-error';
    parent.append(this.root);
  }

  hide(): void {
    this.clear();
    this.root.hidden = true;
  }

  setError(msg: string): void {
    this.error.textContent = msg;
  }

  setBusy(b: boolean): void {
    this.busy = b;
    for (const btn of this.busyButtons) btn.disabled = b;
  }

  async showSelection(error?: string): Promise<void> {
    const list = await this.store.list();
    if (list.length === 0) return this.showCreation(error);
    if (!list.some((c) => c.id === this.selectedId)) this.selectedId = list[0]!.id;
    this.clear();
    this.root.hidden = false;
    this.setError(error ?? '');

    const grid = el('div', 'char-grid');
    for (const c of list) grid.append(this.card(c));

    const selected = list.find((c) => c.id === this.selectedId)!;
    const play = button('btn primary', t('menu.play'), () => this.handlers.onPlay(selected));
    const code = el('input', 'field code');
    code.placeholder = 'ABC234';
    code.maxLength = 8;
    code.autocomplete = 'off';
    code.setAttribute('aria-label', t('menu.code'));
    const join = button('btn', t('menu.join'), () => this.handlers.onJoin(selected, code.value));
    join.dataset.testid = 'join';
    code.onkeydown = (e) => {
      if (e.key === 'Enter' && !this.busy) this.handlers.onJoin(selected, code.value);
    };
    const exportBtn = button('btn small', t('select.export'), () => downloadCharacter(selected));
    const del: HTMLButtonElement = button('btn small danger', t('select.delete'), () =>
      this.guarded(del, async () => {
        if (!confirm(t('select.deleteConfirm', { name: selected.name }))) return;
        await this.store.delete(selected.id);
        this.selectedId = null;
        await this.showSelection();
      }),
    );
    this.busyButtons = [play, join];

    const codeLabel = el('label', 'label', t('menu.code'));
    codeLabel.append(code);
    const actions = el('div', 'actions');
    actions.append(play, el('div', 'or', t('menu.or')), codeLabel, join, el('div', 'row', ''));
    actions.lastElementChild!.append(exportBtn, del);

    const create = button('btn', t('select.create'), () => this.showCreation());
    create.disabled = list.length >= MAX_CHARACTERS;
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    file.dataset.testid = 'import-file';
    file.onchange = () => {
      const f = file.files?.[0];
      file.value = '';
      if (f) void this.guarded(importBtn, () => this.importFile(f));
    };
    const importBtn = button('btn', t('select.import'), () => file.click());
    const footer = el('div', 'row');
    footer.append(create, importBtn, file);

    const panel = el('div', 'panel wide');
    panel.append(el('h1', 'title', t('menu.title')), el('h2', 'subtitle', t('select.title')), this.storageWarning(), grid, actions, footer, this.error);
    this.root.append(panel, el('div', 'version', t('menu.version', { version: this.version })));
    this.setBusy(this.busy);
  }

  showCreation(error?: string): void {
    this.clear();
    this.root.hidden = false;
    this.setError(error ?? '');
    let classId: ClassId = 'warrior';
    const look: Appearance = defaultAppearance(classId);

    const canvas = el('canvas', 'preview big');
    const preview = new PreviewCanvas(canvas, 3);
    this.previews.push(preview);
    const refresh = () => void preview.setCharacter(classId, { ...look });
    refresh();
    preview.start();
    const rotate = el('div', 'row center');
    rotate.append(
      button('btn small', '◀', () => preview.setFacing(preview.currentFacing + 1)),
      el('span', 'muted', t('create.rotate')),
      button('btn small', '▶', () => preview.setFacing(preview.currentFacing + 3)),
    );

    const name = el('input', 'field');
    name.maxLength = 16;
    name.autocomplete = 'off';
    name.setAttribute('aria-label', t('create.name'));
    const nameError = el('p', 'error small');
    nameError.dataset.testid = 'name-error';
    let existing: string[] = [];
    void this.store.list().then((l) => (existing = l.map((c) => c.name)));
    name.oninput = () => {
      const v = validateName(name.value, existing);
      nameError.textContent = v.ok || name.value === '' ? '' : t(v.error);
    };

    const classes = el('div', 'choices classes');
    for (const id of CLASS_IDS) {
      const b = button('choice', '', () => {
        classId = id;
        mark(classes, b);
        refresh();
      });
      b.append(el('strong', '', t(`class.${id}`)), el('span', 'muted', t(`class.${id}.role`)));
      b.dataset.value = id;
      if (id === classId) b.classList.add('on');
      classes.append(b);
    }

    const picker = (title: string, opts: { id: string; labelKey: string; swatch?: string }[], key: keyof Appearance) => {
      const box = el('div', 'choices');
      for (const o of opts) {
        const b = button(o.swatch ? 'choice swatch' : 'choice', o.swatch ? '' : t(o.labelKey), () => {
          look[key] = o.id;
          mark(box, b);
          refresh();
        });
        b.title = t(o.labelKey);
        b.setAttribute('aria-label', t(o.labelKey));
        b.dataset.value = o.id;
        if (o.swatch) b.style.background = o.swatch;
        if (look[key] === o.id) b.classList.add('on');
        box.append(b);
      }
      const l = el('div', 'label', title);
      l.append(box);
      return l;
    };

    const submit: HTMLButtonElement = button('btn primary', t('create.submit'), () =>
      this.guarded(submit, async () => {
        const list = await this.store.list();
        if (list.length >= MAX_CHARACTERS) return this.setError(t('import.full'));
        const v = validateName(name.value, list.map((c) => c.name));
        if (!v.ok) {
          nameError.textContent = t(v.error);
          return;
        }
        const c = createCharacter({ name: v.name, classId, appearance: { ...look } });
        await this.store.put(c);
        this.select(c.id);
        await this.showSelection();
      }),
    );
    const back = button('btn', t('create.back'), () => void this.showSelection());
    void this.store.list().then((l) => (back.hidden = l.length === 0));

    const nameLabel = el('label', 'label', t('create.name'));
    nameLabel.append(name, nameError);
    const classLabel = el('div', 'label', t('create.class'));
    classLabel.append(classes);
    const form = el('div', 'form');
    form.append(
      nameLabel,
      classLabel,
      picker(t('create.body'), CATALOG.bodies, 'body'),
      picker(t('create.skin'), CATALOG.skins, 'skin'),
      picker(t('create.hair'), CATALOG.hairStyles, 'hairStyle'),
      picker(t('create.hairColor'), CATALOG.hairColors, 'hairColor'),
    );
    const side = el('div', 'side');
    side.append(canvas, rotate);
    const body = el('div', 'create');
    body.append(side, form);
    const footer = el('div', 'row');
    footer.append(back, submit);

    const panel = el('div', 'panel wide');
    panel.append(el('h1', 'title', t('menu.title')), el('h2', 'subtitle', t('create.title')), this.storageWarning(), body, footer, this.error);
    this.root.append(panel);
    name.focus();
  }

  private card(c: Character): HTMLElement {
    const b = button('char-card', '', () => {
      this.select(c.id);
      void this.showSelection();
    });
    b.dataset.testid = 'char-card';
    if (c.id === this.selectedId) b.classList.add('on');
    const canvas = el('canvas', 'preview');
    const preview = new PreviewCanvas(canvas, 1.5);
    void preview.setCharacter(c.classId, c.appearance, equipmentLooks(c.equipment));
    preview.start();
    this.previews.push(preview);
    b.append(canvas, el('strong', 'char-name', c.name), el('span', 'muted', t(`class.${c.classId}`)), el('span', 'muted', t('select.level', { level: c.level })));
    return b;
  }

  private async importFile(f: File): Promise<void> {
    const raw = await readCharacterFile(f);
    const plan = planImport(raw, await this.store.list());
    if (plan.kind === 'error') return this.setError(t(plan.error));
    if (plan.kind === 'replace' && !confirm(t('import.replaceConfirm', { name: plan.character.name }))) return;
    await this.store.put(plan.character);
    this.select(plan.character.id);
    await this.showSelection();
  }

  /**
   * Runs a storage action at most once at a time (double clicks are ignored) and reports failures
   * (quota exceeded, evicted storage) instead of failing silently.
   */
  private async guarded(btn: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      this.setError('');
      await action();
    } catch (e) {
      console.warn('[screens] storage action failed', e);
      this.setError(t('save.failed'));
    } finally {
      btn.disabled = false;
    }
  }

  private storageWarning(): HTMLElement {
    const w = el('p', 'warning', t('save.unavailable'));
    w.hidden = this.store.persistent;
    return w;
  }

  private select(id: string): void {
    this.selectedId = id;
    prefs.set(LAST_SELECTED, id);
  }

  private clear(): void {
    for (const p of this.previews) p.stop();
    this.previews = [];
    this.busyButtons = [];
    this.root.replaceChildren();
  }
}

function mark(box: HTMLElement, on: HTMLElement): void {
  for (const c of box.children) c.classList.toggle('on', c === on);
}
