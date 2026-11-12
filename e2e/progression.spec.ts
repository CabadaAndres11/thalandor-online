import { expect, test, type Page } from '@playwright/test';
import { chat, closeContextsAfterEach, createCharacter, openPage, type ClassId } from './helpers';

closeContextsAfterEach();

interface Progress {
  level: number;
  freeAttrPoints: number;
  freeTalentPoints: number;
  attributes: Record<string, number>;
  talents: Record<string, number>;
  specId: string | null;
  slots: Record<string, string | null>;
}
const progress = (page: Page) => page.evaluate(() => (window.__thalandor as unknown as { progress(): Progress | null }).progress());

async function soloGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Jugar' }).click();
  await expect(page.locator('.combat-hud')).toBeVisible();
  await expect.poll(() => progress(page)).not.toBeNull();
}

async function newSolo(browser: Parameters<typeof openPage>[0], name: string, classId: ClassId): Promise<Page> {
  const page = await openPage(browser);
  await createCharacter(page, name, classId);
  await soloGame(page);
  return page;
}

test('level up with /dev, spend attribute points, and they persist after reloading', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await newSolo(browser, 'Novato', 'mage');
  await chat(page, '/dev xp 100');
  await expect.poll(async () => (await progress(page))?.level).toBe(2);
  await expect(page.locator('.chat-line', { hasText: 'Novato ha alcanzado el nivel 2' })).toBeVisible();
  await expect(page.locator('.level-badge')).toHaveText('2');
  await page.keyboard.press('c');
  const plus = page.locator('[data-plus=intellect]');
  for (let i = 0; i < 3; i++) await plus.click();
  await expect.poll(async () => (await progress(page))?.attributes.intellect).toBe(3);
  expect((await progress(page))?.freeAttrPoints).toBe(2);
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.reload();
  await expect(page.locator('[data-testid=char-card]', { hasText: 'Nivel 2' })).toBeVisible({ timeout: 20_000 });
  await soloGame(page);
  expect(await progress(page)).toMatchObject({ level: 2, attributes: { intellect: 3 }, freeAttrPoints: 2 });
});

test('talents: spend a point, respect requirements, reset', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await newSolo(browser, 'Talentos', 'warrior');
  await chat(page, '/dev level 5');
  await expect.poll(async () => (await progress(page))?.freeTalentPoints).toBe(4);
  await page.keyboard.press('n');
  await expect(page.locator('[data-talent=might_2a]')).toHaveClass(/locked/);
  for (let i = 0; i < 3; i++) await page.locator('[data-talent=might_1a]').click();
  await expect.poll(async () => (await progress(page))?.talents.might_1a).toBe(3);
  await expect(page.locator('[data-talent=might_2a]')).toHaveClass(/can/);
  await page.locator('[data-talent=might_2a]').click();
  await expect.poll(async () => (await progress(page))?.freeTalentPoints).toBe(0);
  await page.getByRole('button', { name: 'Reiniciar talentos' }).click();
  await expect.poll(async () => (await progress(page))?.talents).toEqual({});
  expect((await progress(page))?.freeTalentPoints).toBe(4);
});

test('choose a specialization at level 10 and use its ability', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await newSolo(browser, 'Escudo', 'warrior');
  await chat(page, '/dev level 10');
  // The specialization window opens by itself.
  await expect(page.locator('.game-window[data-window=spec]')).toBeVisible();
  await page.getByRole('button', { name: 'Elegir Protección' }).click();
  await expect.poll(async () => (await progress(page))?.slots.s4).toBe('warrior_taunt');
  await expect(page.locator('.hotbar [data-ability=warrior_taunt]')).toBeVisible();
  // Rage for the taunt: take a hit, then press 4.
  await chat(page, '/dev hurt 150');
  await expect.poll(() => page.evaluate(() => window.__thalandor.me()?.resource ?? 0)).toBeGreaterThanOrEqual(10);
  await page.keyboard.press('4');
  await expect.poll(() => page.evaluate(() => window.__thalandor.me()?.cd.s4 ?? 0)).toBeGreaterThan(0);
});
