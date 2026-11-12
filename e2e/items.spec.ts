import { expect, test, type Page } from '@playwright/test';
import { chat, closeContextsAfterEach, createCharacter, holdKey, openPage } from './helpers';

closeContextsAfterEach();

interface Inv {
  gold: number;
  inventory: ({ uid: string; baseId?: string; potion?: string; count?: number } | null)[];
  equipment: Record<string, { uid: string; baseId: string }>;
  merchant: { stock: { id: string; price: number }[] } | null;
}
type Hooks = { inventory(): Inv | null; selfGear(): Record<string, string> };
const inv = (page: Page) => page.evaluate(() => (window.__thalandor as unknown as Hooks).inventory());
const bagItems = async (page: Page) => (await inv(page))?.inventory.filter((i): i is NonNullable<typeof i> => i !== null) ?? [];

async function solo(browser: Parameters<typeof openPage>[0], name: string): Promise<Page> {
  const page = await openPage(browser);
  await createCharacter(page, name, 'warrior');
  await page.getByRole('button', { name: 'Jugar' }).click();
  await expect(page.locator('.combat-hud')).toBeVisible();
  await expect.poll(() => inv(page)).not.toBeNull();
  return page;
}

test('equip an item from the bag: stats, look and persistence', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await solo(browser, 'Armado');
  await chat(page, '/dev item rare head');
  await expect.poll(async () => (await bagItems(page)).length).toBe(1);
  await page.keyboard.press('i');
  await expect(page.locator('.bag-window')).toBeVisible();
  await page.locator('.bag-grid [data-index="0"]').click({ button: 'right' });
  await expect.poll(async () => (await inv(page))?.equipment.head?.baseId).toBeTruthy();
  await expect.poll(() => page.evaluate(() => (window.__thalandor as unknown as Hooks).selfGear().head)).toBeTruthy();
  const uid = (await inv(page))!.equipment.head!.uid;
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.reload();
  await expect(page.locator('.screens .title')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Jugar' }).click();
  await expect.poll(async () => (await inv(page))?.equipment.head?.uid).toBe(uid);
});

test('merchant: open with E, buy a potion, sell an item', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await solo(browser, 'Comprador');
  await chat(page, '/dev gold 300');
  await chat(page, '/dev item common');
  await expect.poll(async () => (await inv(page))?.gold).toBe(300);
  await expect.poll(async () => (await bagItems(page)).length).toBe(1);
  // The merchant stands a few tiles east of the spawn.
  await holdKey(page, 'd', 750);
  await expect(page.locator('.hud-prompt', { hasText: 'Pulsa E para comerciar' })).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('.shop-window')).toBeVisible();
  const price = (await inv(page))!.merchant!.stock.find((s) => s.id === 'potion_health')!.price;
  await page.locator('[data-stock="potion_health"] button').click();
  await expect.poll(async () => (await bagItems(page)).some((i) => i.potion === 'health')).toBe(true);
  expect((await inv(page))!.gold).toBe(300 - price);
  const before = (await inv(page))!.gold;
  const gearIndex = (await inv(page))!.inventory.findIndex((i) => i?.baseId);
  await page.locator(`.bag-grid [data-index="${gearIndex}"]`).click({ button: 'right' });
  await expect.poll(async () => (await inv(page))!.gold).toBeGreaterThan(before);
  expect((await bagItems(page)).some((i) => i.baseId)).toBe(false);
});

test('a health potion heals with Q', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await solo(browser, 'Sediento');
  await chat(page, '/dev potion health 2');
  await chat(page, '/dev hurt 150');
  await expect.poll(() => page.evaluate(() => window.__thalandor.self()?.hp ?? 0)).toBeLessThan(150);
  const hurt = await page.evaluate(() => window.__thalandor.self()!.hp);
  await page.keyboard.press('q');
  await expect.poll(() => page.evaluate(() => window.__thalandor.self()!.hp)).toBeGreaterThan(hurt + 30);
  await expect.poll(async () => (await bagItems(page)).find((i) => i.potion === 'health')?.count).toBe(1);
});
