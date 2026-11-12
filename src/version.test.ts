import { GAME_VERSION } from './version';

test('GAME_VERSION matches package.json', () => {
  expect(GAME_VERSION).toBe('0.4.2');
});
