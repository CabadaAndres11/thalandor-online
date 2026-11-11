import Phaser from 'phaser';
import arena from '../../data/maps/test-arena.json';
import { GAME_VERSION } from '../version';
import { defaultAppearance } from '../appearance/catalog';
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
  const session = new ClientSession(conn, {
    version: GAME_VERSION,
    // Temporary until the character screens (Plan 2, Task 8) provide the real character.
    character: { name, classId: 'warrior', appearance: defaultAppearance('warrior'), lastLocation: null },
    map,
  });
  current = { session, host };
  // Events from a session that is no longer current must never touch the UI or the active game.
  const live =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => {
      if (current?.session === session) fn(...a);
    };
  session.on('rejected', live(({ reason }) => backToMenu(reason === 'version' ? t('error.version') : t('error.full'))));
  session.on('disconnected', live(() => backToMenu(t('error.hostClosed'))));
  session.on('chat', live(({ from, text }) => overlay.addChat(from, text)));
  session.on('joined', live(({ name: n }) => overlay.addChat(null, t('chat.joined', { name: n }))));
  session.on('left', live(({ name: n }) => overlay.addChat(null, t('chat.left', { name: n }))));
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
  game.scene.start('game', {
    session,
    mapId: MAP_ID,
    mapJson,
    self: { name, classId: 'warrior', appearance: defaultAppearance('warrior') },
    isTyping: () => overlay.chatOpen,
  });
}

function onPlay(rawName: string): void {
  const host = startWorkerHost({ version: GAME_VERSION, mapId: MAP_ID, mapJson, defaultName: t('player.defaultName') });
  startGame(host.connectLocal(), playerName(rawName), host);
}

let joining = false;

async function onJoin(rawName: string, rawCode: string): Promise<void> {
  if (joining || current) return; // e.g. Enter pressed twice in the code field
  const code = normalizeRoomCode(rawCode);
  if (!code) return overlay.setMenuError(t('error.badCode'));
  joining = true;
  overlay.setMenuError('');
  overlay.setMenuBusy(true);
  try {
    const conn = await createPeerClient().connect(code);
    startGame(conn, playerName(rawName), null);
  } catch (e) {
    overlay.setMenuBusy(false);
    overlay.setMenuError(e instanceof TransportError && e.kind === 'room-not-found' ? t('error.roomNotFound') : t('error.timeout'));
  } finally {
    joining = false;
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
