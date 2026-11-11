import { expect, test } from '@playwright/test';
import { closeContextsAfterEach, holdKey, hostGame, joinGame, readyToJoin } from './helpers';

closeContextsAfterEach();

test('four players join one group and see each other', async ({ browser }) => {
  const { page: host, code } = await hostGame(browser, 'Ana');
  const guests = [];
  for (const name of ['Beto', 'Cira', 'Dani']) guests.push(await joinGame(browser, name, code));
  for (const p of [host, ...guests]) {
    await expect.poll(() => p.evaluate(() => window.__thalandor.playerCount()), { timeout: 10_000 }).toBe(4);
  }
  const names = await host.evaluate(() => window.__thalandor.others().map((o) => o.name).sort());
  expect(names).toEqual(['Beto', 'Cira', 'Dani']);
});

test('fifth player is rejected because the group is full', async ({ browser }) => {
  const { code } = await hostGame(browser, 'Ana');
  for (const name of ['Beto', 'Cira', 'Dani']) await joinGame(browser, name, code);
  const fifth = await readyToJoin(browser, 'Eva');
  await fifth.getByLabel('Código de grupo').fill(code);
  await fifth.getByRole('button', { name: 'Unirse a un amigo' }).click();
  await expect(fifth.getByText('La partida está llena (máximo 4 jugadores)')).toBeVisible({ timeout: 15_000 });
});

test('host tab throttled keeps world ticking', async ({ browser }) => {
  const { page: host, code } = await hostGame(browser, 'Ana');
  const mover = await joinGame(browser, 'Beto', code);
  const watcher = await joinGame(browser, 'Cira', code);
  await expect.poll(() => watcher.evaluate(() => window.__thalandor.others().length)).toBe(2);
  // Emulate a background tab on the host: no rendering and main-thread timers clamped to 1 s.
  await host.evaluate(() => {
    window.__thalandor.game.loop.sleep();
    const origTimeout = window.setTimeout;
    const origInterval = window.setInterval;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => origTimeout(fn, Math.max(1000, ms ?? 0), ...a)) as typeof setTimeout;
    window.setInterval = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => origInterval(fn, Math.max(1000, ms ?? 0), ...a)) as typeof setInterval;
  });
  const beto = () => watcher.evaluate(() => window.__thalandor.others().find((o) => o.name === 'Beto')!);
  const before = await beto();
  await holdKey(mover, 'd', 2000);
  await expect.poll(async () => (await beto()).x - before.x, { timeout: 5_000 }).toBeGreaterThan(100);
});

test('wrong code shows room not found', async ({ browser }) => {
  const page = await readyToJoin(browser, 'Zoe');
  await page.getByLabel('Código de grupo').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Unirse a un amigo' }).click();
  await expect(page.getByText('No se encontró la partida')).toBeVisible({ timeout: 10_000 });
});

test('bad code format shows a hint without connecting', async ({ browser }) => {
  const page = await readyToJoin(browser, 'Zoe');
  await page.getByLabel('Código de grupo').fill('ABC10');
  await page.getByRole('button', { name: 'Unirse a un amigo' }).click();
  await expect(page.getByText('El código debe tener 6 caracteres')).toBeVisible();
});

test('chat message reaches all players', async ({ browser }) => {
  const { page: host, code } = await hostGame(browser, 'Ana');
  const b = await joinGame(browser, 'Beto', code);
  const c = await joinGame(browser, 'Cira', code);
  await b.keyboard.press('Enter');
  await b.keyboard.type('<i>hola</i> a todos');
  await b.keyboard.press('Enter');
  for (const p of [host, b, c]) {
    await expect(p.locator('.chat-line', { hasText: 'Beto: <i>hola</i> a todos' })).toBeVisible();
    await expect(p.locator('.chat-log i')).toHaveCount(0);
  }
});

test('pressing Enter twice in the code field joins only once', async ({ browser }) => {
  const { page: host, code } = await hostGame(browser, 'Ana');
  const guest = await readyToJoin(browser, 'Beto');
  await guest.getByLabel('Código de grupo').fill(code);
  await guest.getByLabel('Código de grupo').press('Enter');
  await guest.getByLabel('Código de grupo').press('Enter');
  await expect(guest.getByRole('button', { name: 'Salir' })).toBeVisible({ timeout: 15_000 });
  // Past the host's 5 s silence timeout: a ghost session would have been kicked by now.
  await guest.waitForTimeout(7000);
  expect(await host.evaluate(() => window.__thalandor.others().map((o) => o.name))).toEqual(['Beto']);
  await expect(guest.getByRole('button', { name: 'Salir' })).toBeVisible();
  await expect(host.locator('.chat-line', { hasText: 'Beto se ha unido' })).toHaveCount(1);
});

test('guest returns to menu when host leaves', async ({ browser }) => {
  const { page: host, code } = await hostGame(browser, 'Ana');
  const guest = await joinGame(browser, 'Beto', code);
  await host.getByRole('button', { name: 'Salir' }).click();
  await expect(guest.getByText('El anfitrión ha cerrado la partida')).toBeVisible({ timeout: 10_000 });
  await expect(guest.getByRole('button', { name: 'Jugar' })).toBeVisible();
});
