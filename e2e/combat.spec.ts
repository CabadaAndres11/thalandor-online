import { expect, test, type Page } from '@playwright/test';
import { chat, closeContextsAfterEach, createCharacter, hostGame, joinGame, openPage, screenOf, type ClassId } from './helpers';

closeContextsAfterEach();

async function soloGame(browser: Parameters<typeof openPage>[0], name: string, classId: ClassId): Promise<Page> {
  const page = await openPage(browser);
  await createCharacter(page, name, classId);
  await page.getByRole('button', { name: 'Jugar' }).click();
  await expect(page.locator('.combat-hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__thalandor.self())).not.toBeNull();
  return page;
}

test('kill a skeleton with basic attacks', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await soloGame(browser, 'Tajos', 'warrior');
  const before = new Set((await page.evaluate(() => window.__thalandor.units())).map((u) => u.id));
  await chat(page, '/dev spawn skeleton 45 0');
  // The arena has its own skeletons: follow the one we just spawned.
  await expect.poll(async () => (await page.evaluate(() => window.__thalandor.units())).some((u) => u.type === 'skeleton' && !before.has(u.id))).toBe(true);
  const target = (await page.evaluate(() => window.__thalandor.units())).find((u) => u.type === 'skeleton' && !before.has(u.id))!.id;
  const dead = async () => {
    const u = (await page.evaluate(() => window.__thalandor.units())).find((x) => x.id === target);
    return !u || u.state === 'dead';
  };
  for (let i = 0; i < 40 && !(await dead()); i++) {
    const at = await screenOf(page, (u) => u.id === target);
    if (at) {
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.waitForTimeout(400);
      await page.mouse.up();
    }
  }
  expect(await dead()).toBe(true);
});

test('cleric heals a damaged ally', async ({ browser }) => {
  test.setTimeout(60_000);
  const { page: cleric, code } = await hostGame(browser, 'Sanadora', 'cleric');
  const warrior = await joinGame(browser, 'Herido', code, 'warrior');
  await chat(warrior, '/dev hurt 120');
  const allyHp = async () => (await cleric.evaluate(() => window.__thalandor.units())).find((u) => u.name === 'Herido')?.hp ?? 0;
  await expect.poll(allyHp).toBeLessThan(200);
  const before = await allyHp();
  const at = await screenOf(cleric, (u) => u.name === 'Herido');
  expect(at).not.toBeNull();
  await cleric.mouse.click(at!.x, at!.y, { button: 'right' });
  await expect.poll(allyHp, { timeout: 5000 }).toBeGreaterThan(before);
});

test('downed player is revived by an ally holding E', async ({ browser }) => {
  test.setTimeout(60_000);
  const { page: host, code } = await hostGame(browser, 'Salvador', 'warrior');
  const guest = await joinGame(browser, 'Caido', code, 'cleric');
  await chat(guest, '/dev kill');
  const guestState = async () => (await host.evaluate(() => window.__thalandor.units())).find((u) => u.name === 'Caido')?.state;
  await expect.poll(guestState).toBe('downed');
  await expect(host.getByText('Mantén E para levantar')).toBeVisible();
  await host.keyboard.down('e');
  await expect.poll(guestState, { timeout: 8000 }).toBe('alive');
  await host.keyboard.up('e');
});

test('hotbar shows the cooldown after using an ability', async ({ browser }) => {
  const page = await soloGame(browser, 'Cargas', 'warrior');
  const slot = page.locator('.slot[data-slot="s1"]');
  await expect(slot).not.toHaveClass(/cooling/);
  await page.mouse.move(700, 300);
  await page.keyboard.press('1');
  await expect(slot).toHaveClass(/cooling/);
  await expect(slot.locator('.slot-cd')).not.toHaveText('');
});
