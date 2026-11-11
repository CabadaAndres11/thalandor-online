import { t } from './i18n';

test('interpolates vars', () => {
  expect(t('game.groupCode', { code: 'ABC234' })).toBe('Código: ABC234');
  expect(t('chat.joined', { name: 'Ana' })).toBe('Ana se ha unido');
});

test('returns key when missing', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(t('nope.missing')).toBe('nope.missing');
  expect(t('nope.missing')).toBe('nope.missing');
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('exact texts from the plan', () => {
  expect(t('menu.title')).toBe('Thalandor Online');
  expect(t('error.roomNotFound')).toBe('No se encontró la partida');
  expect(t('error.hostClosed')).toBe('El anfitrión ha cerrado la partida');
  expect(t('error.full')).toBe('La partida está llena (máximo 4 jugadores)');
});
