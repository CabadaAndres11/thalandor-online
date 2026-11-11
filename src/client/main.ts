import Phaser from 'phaser';
import arena from '../../data/maps/test-arena.json';
import { GAME_VERSION } from '../version';
import { CollisionMap, type TiledMap } from '../sim/collision-map';
import { MAX_NAME_LENGTH } from '../host/host-session';
import { startWorkerHost, type WorkerHostHandle } from '../host/worker-host';
import { createPeerClient, createPeerHost } from '../net/peer-transport';
import { normalizeRoomCode } from '../net/room-code';
import { TransportError, type Connection } from '../net/transport';
import { ClientSession } from './client-session';
import { t } from './i18n';
import { Overlay } from './ui/overlay';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

const MAP_ID = 'test-arena';
const mapJson = arena as unknown as TiledMap;
const map = CollisionMap.fromTiled(mapJson);

const overlay = new Overlay(document.getElementById('ui')!, GAME_VERSION);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d0f0c',
  pixelArt: true,
  // min size: a tab opened in the background reports a 0x0 parent, which breaks WebGL framebuffers.
  scale: { mode: Phaser.Scale.RESIZE, min: { width: 320, height: 240 } },
  scene: [BootScene, GameScene],
});

let current: { session: ClientSession; host: WorkerHostHandle | null } | null = null;

function playerName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME_LENGTH) || t('player.defaultName');
}

function backToMenu(error?: string): void {
  if (current) {
    current.session.close();
    current.host?.stop();
    current = null;
  }
  if (game.scene.isActive('game')) game.scene.stop('game');
  overlay.showMenu({ onPlay, onJoin }, error);
}

function startGame(conn: Connection, name: string, host: WorkerHostHandle | null): void {
  const session = new ClientSession(conn, { version: GAME_VERSION, name, map });
  current = { session, host };
  session.on('rejected', ({ reason }) => backToMenu(reason === 'version' ? t('error.version') : t('error.full')));
  session.on('disconnected', () => backToMenu(t('error.hostClosed')));
  session.on('chat', ({ from, text }) => overlay.addChat(from, text));
  session.on('joined', ({ name: n }) => overlay.addChat(null, t('chat.joined', { name: n })));
  session.on('left', ({ name: n }) => overlay.addChat(null, t('chat.left', { name: n })));
  overlay.showGame({
    isHost: host !== null,
    onOpenGroup: async () => {
      const transport = await createPeerHost();
      host!.addTransport(transport);
      return transport.code;
    },
    onChat: (text) => session.sendChat(text),
    onLeave: () => backToMenu(),
  });
  game.scene.start('game', { session, map, selfName: name, isTyping: () => overlay.chatOpen });
}

function onPlay(rawName: string): void {
  const host = startWorkerHost({ version: GAME_VERSION, mapId: MAP_ID, mapJson, defaultName: t('player.defaultName') });
  startGame(host.connectLocal(), playerName(rawName), host);
}

async function onJoin(rawName: string, rawCode: string): Promise<void> {
  const code = normalizeRoomCode(rawCode);
  if (!code) return overlay.setMenuError(t('error.badCode'));
  overlay.setMenuError('');
  overlay.setMenuBusy(true);
  try {
    const conn = await createPeerClient().connect(code);
    startGame(conn, playerName(rawName), null);
  } catch (e) {
    overlay.setMenuBusy(false);
    overlay.setMenuError(e instanceof TransportError && e.kind === 'room-not-found' ? t('error.roomNotFound') : t('error.timeout'));
  }
}

game.events.once('booted', () => overlay.showMenu({ onPlay, onJoin }));

if (import.meta.env.DEV) {
  // Test hooks for Playwright (dev builds only).
  (window as unknown as { __thalandor: unknown }).__thalandor = {
    game,
    playerCount: () => (game.scene.isActive('game') ? (game.scene.getScene('game') as GameScene).drawnPlayers : 0),
    selfPos: () => (current ? current.session.renderState(performance.now()).self : null),
    others: () => (current ? [...current.session.renderState(performance.now()).others.values()].map((o) => ({ name: o.name, ...o.pos })) : []),
  };
}
