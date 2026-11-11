import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { closeContextsAfterEach, createCharacter, holdKey, hostGame, joinGame, openPage } from './helpers';

closeContextsAfterEach();

test('create, play, move, leave, reload: character persists and respawns at saved position', async ({ browser }) => {
  const page = await openPage(browser);
  await expect(page.locator('.form')).toBeVisible(); // no characters yet: creation opens directly
  await createCharacter(page, 'Lyra', 'mage');
  await page.getByRole('button', { name: 'Jugar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__thalandor.selfPos())).not.toBeNull();
  const start = (await page.evaluate(() => window.__thalandor.selfPos()))!;
  await holdKey(page, 'd', 1200);
  await page.waitForTimeout(500);
  const moved = (await page.evaluate(() => window.__thalandor.selfPos()))!;
  expect(moved.x - start.x).toBeGreaterThan(60);
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('button', { name: 'Jugar' })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-testid=char-card]', { hasText: 'Lyra' })).toBeVisible();
  await page.getByRole('button', { name: 'Jugar' }).click();
  await expect.poll(() => page.evaluate(() => window.__thalandor.selfPos())).not.toBeNull();
  const respawn = (await page.evaluate(() => window.__thalandor.selfPos()))!;
  expect(Math.abs(respawn.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(respawn.y - moved.y)).toBeLessThan(2);
  expect(await page.evaluate(() => window.__thalandor.selfClass())).toBe('mage');
});

test("two players see each other's class and appearance", async ({ browser }) => {
  const { page: host } = await hostGame(browser, 'Ana', 'warrior').then(async (h) => {
    await joinGame(browser, 'Merlin', h.code, 'mage');
    return h;
  });
  await expect.poll(() => host.evaluate(() => window.__thalandor.othersFull())).toEqual([
    expect.objectContaining({ name: 'Merlin', classId: 'mage', appearance: expect.objectContaining({ body: 'male' }) }),
  ]);
});

test('guest sees host class and appearance too', async ({ browser }) => {
  const { code } = await hostGame(browser, 'Ana', 'cleric');
  const guest = await joinGame(browser, 'Merlin', code, 'explorer');
  await expect.poll(() => guest.evaluate(() => window.__thalandor.othersFull())).toEqual([
    expect.objectContaining({ name: 'Ana', classId: 'cleric' }),
  ]);
  expect(await guest.evaluate(() => window.__thalandor.selfClass())).toBe('explorer');
});

test('export then import roundtrip', async ({ browser }, testInfo) => {
  const page = await openPage(browser);
  await createCharacter(page, 'Exportable', 'explorer');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click()]);
  expect(download.suggestedFilename()).toBe('thalandor-Exportable.json');
  const file = testInfo.outputPath('exported.json');
  await download.saveAs(file);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Borrar' }).click();
  await expect(page.locator('.form')).toBeVisible(); // last character deleted: back to creation
  await createCharacter(page, 'Otro', 'warrior');
  await page.locator('[data-testid=import-file]').setInputFiles(file);
  await expect(page.locator('[data-testid=char-card]', { hasText: 'Exportable' })).toBeVisible();
  await expect(page.locator('[data-testid=char-card]')).toHaveCount(2);
});

test('importing a corrupt file shows an error', async ({ browser }, testInfo) => {
  const page = await openPage(browser);
  await createCharacter(page, 'Ana');
  const bad = testInfo.outputPath('bad.json');
  writeFileSync(bad, '{"esto": "no es un personaje"');
  await page.locator('[data-testid=import-file]').setInputFiles(bad);
  await expect(page.getByText('El archivo no es un personaje válido de Thalandor')).toBeVisible();
  await expect(page.locator('[data-testid=char-card]')).toHaveCount(1);
});

test('create is disabled with 8 characters', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await openPage(browser);
  for (let i = 0; i < 8; i++) await createCharacter(page, `Heroe ${String.fromCharCode(65 + i)}`);
  await expect(page.locator('[data-testid=char-card]')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Crear personaje' })).toBeDisabled();
});

test('invalid name shows live validation error and is not created', async ({ browser }) => {
  const page = await openPage(browser);
  await page.getByLabel('Nombre').fill('<b>');
  await expect(page.locator('[data-testid=name-error]')).toHaveText('Usa solo letras, números, espacios, guiones y apóstrofos');
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.locator('.form')).toBeVisible();
  await expect(page.locator('[data-testid=char-card]')).toHaveCount(0);
});
