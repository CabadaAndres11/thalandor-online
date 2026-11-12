import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Hooks {
  playerCount(): number;
  selfPos(): { x: number; y: number } | null;
  selfClass(): string | null;
  others(): { name: string; x: number; y: number }[];
  othersFull(): { name: string; classId?: string; appearance?: Record<string, string> }[];
  saveNow(): Promise<void> | undefined;
  units(): { id: number; kind: string; type: string; name: string; hp: number; maxHp: number; state: string; x: number; y: number }[];
  self(): { hp: number; maxHp: number; state: string; x: number; y: number } | null;
  me(): { resource: number; cd: Record<string, number> } | null;
  toScreen(x: number, y: number): { x: number; y: number };
  game: { loop: { sleep(): void } };
}
declare global {
  interface Window {
    __thalandor: Hooks;
  }
}

const contexts: BrowserContext[] = [];

/** Call once per spec file: closes every browser context opened by the helpers after each test. */
export function closeContextsAfterEach(): void {
  test.afterEach(async () => {
    await Promise.all(contexts.splice(0).map((c) => c.close()));
  });
}

/** A fresh browser context (own IndexedDB), on the first screen of the game. */
export async function openPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ acceptDownloads: true });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto('/');
  // Generous: several full games run at once in one test machine during group tests.
  await expect(page.locator('.screens .title')).toBeVisible({ timeout: 20_000 });
  return page;
}

export type ClassId = 'warrior' | 'cleric' | 'mage' | 'explorer';

/** Creates a character from the creation screen and returns once the selection screen shows it. */
export async function createCharacter(page: Page, name: string, classId: ClassId = 'warrior'): Promise<void> {
  if (!(await page.locator('.form').isVisible())) await page.getByRole('button', { name: 'Crear personaje' }).click();
  await page.locator(`.choices.classes [data-value=${classId}]`).click();
  await page.getByLabel('Nombre').fill(name);
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.locator('[data-testid=char-card]', { hasText: name })).toBeVisible();
}

export async function hostGame(browser: Browser, name: string, classId: ClassId = 'warrior'): Promise<{ page: Page; code: string }> {
  const page = await openPage(browser);
  await createCharacter(page, name, classId);
  await page.getByRole('button', { name: 'Jugar' }).click();
  await page.getByRole('button', { name: 'Abrir grupo' }).click();
  const groupBtn = page.locator('[data-testid=group]');
  await expect(groupBtn).toHaveText(/Código: [A-Z2-9]{6}/, { timeout: 15_000 });
  const code = (await groupBtn.getAttribute('data-code'))!;
  return { page, code };
}

/** Opens a page with a character ready to join (code not entered yet). */
export async function readyToJoin(browser: Browser, name: string, classId: ClassId = 'warrior'): Promise<Page> {
  const page = await openPage(browser);
  await createCharacter(page, name, classId);
  return page;
}

export async function joinGame(browser: Browser, name: string, code: string, classId: ClassId = 'warrior'): Promise<Page> {
  const page = await readyToJoin(browser, name, classId);
  await page.getByLabel('Código de grupo').fill(code);
  await page.getByRole('button', { name: 'Unirse a un amigo' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible({ timeout: 15_000 });
  return page;
}

export async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Sends a chat line (e.g. a /dev command in development builds). */
export async function chat(page: Page, text: string): Promise<void> {
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Page coordinates of a unit (or null when not visible). */
export async function screenOf(page: Page, pick: (u: ReturnType<Hooks['units']>[number]) => boolean): Promise<{ x: number; y: number } | null> {
  const units = await page.evaluate(() => window.__thalandor.units());
  const u = units.find(pick);
  return u ? page.evaluate(([x, y]) => window.__thalandor.toScreen(x, y), [u.x, u.y] as [number, number]) : null;
}
