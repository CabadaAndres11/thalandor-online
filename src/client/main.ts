import Phaser from 'phaser';
import arena from '../../data/maps/test-arena.json';
import { GAME_VERSION } from '../version';
import { CollisionMap, type TiledMap } from '../sim/collision-map';
import { startWorkerHost, type WorkerHostHandle } from '../host/worker-host';
import { createPeerClient, createPeerHost } from '../net/peer-transport';
import { normalizeRoomCode } from '../net/room-code';
import { TransportError, type Connection } from '../net/transport';
import type { Character } from '../save/character';
import { openCharacterStore } from '../save/store';
import { AutoSaver } from './autosave';
import { ClientSession } from './client-session';
import { t } from './i18n';
import { Overlay } from './ui/overlay';
import { Screens } from './ui/screens';
import { Hud } from './hud/hud';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

const MAP_ID = 'test-arena';
const mapJson = arena as unknown as TiledMap;
const map = CollisionMap.fromTiled(mapJson);

const uiRoot = document.getElementById('ui')!;
const store = await openCharacterStore();
const overlay = new Overlay(uiRoot);
const hud = new Hud(uiRoot);
const screens = new Screens(uiRoot, store, { onPlay, onJoin }, GAME_VERSION);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d0f0c',
  pixelArt: true,
  // min size: a tab opened in the background reports a 0x0 parent, which breaks WebGL framebuffers.
  scale: { mode: Phaser.Scale.RESIZE, min: { width: 320, height: 240 } },
  scene: [BootScene, GameScene],
});

// Phaser only listens to window resizes: a tab loaded in the background starts at the minimum size and
// must grow when its container gets a real size.
new ResizeObserver(() => game.scale.refresh()).observe(document.getElementById('game')!);

interface Current {
  session: ClientSession;
  host: WorkerHostHandle | null;
  saver: AutoSaver;
  character: Character;
}
let current: Current | null = null;

function backToMenu(error?: string): void {
  if (current) {
    const { session, host, saver } = current;
    current = null;
    saver.stop();
    void saver.saveNow();
    session.close();
    host?.stop();
  }
  // Stop unconditionally: a start queued while the tab was hidden is not "active" yet.
  game.scene.stop('game');
  overlay.hide();
  void screens.showSelection(error);
}

function startGame(conn: Connection, character: Character, host: WorkerHostHandle | null): void {
  const session = new ClientSession(conn, {
    version: GAME_VERSION,
    character: { name: character.name, classId: character.classId, appearance: character.appearance, lastLocation: character.lastLocation },
    map,
  });
  const saver = new AutoSaver({ store, character, mapId: MAP_ID, getLocation: () => session.selfLocation() });
  current = { session, host, saver, character };
  saver.start();
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
  screens.hide();
  overlay.show({
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
    self: { name: character.name, classId: character.classId, appearance: character.appearance },
    hud,
    isTyping: () => overlay.chatOpen,
  });
}

function onPlay(character: Character): void {
  if (current || joining) return;
  const host = startWorkerHost({ version: GAME_VERSION, mapId: MAP_ID, mapJson, defaultName: t('player.defaultName') });
  startGame(host.connectLocal(), character, host);
}

let joining = false;

async function onJoin(character: Character, rawCode: string): Promise<void> {
  if (joining || current) return; // e.g. Enter pressed twice in the code field
  const code = normalizeRoomCode(rawCode);
  if (!code) return screens.setError(t('error.badCode'));
  joining = true;
  screens.setError('');
  screens.setBusy(true);
  try {
    const conn = await createPeerClient().connect(code);
    screens.setBusy(false);
    startGame(conn, character, null);
  } catch (e) {
    screens.setBusy(false);
    screens.setError(e instanceof TransportError && e.kind === 'room-not-found' ? t('error.roomNotFound') : t('error.timeout'));
  } finally {
    joining = false;
  }
}

// Save the position when the tab is closed or hidden for good.
addEventListener('pagehide', () => void current?.saver.saveNow());

game.events.once('booted', () => void screens.showSelection());

if (import.meta.env.DEV) {
  // Test hooks for Playwright (dev builds only).
  const all = () => (current ? [...current.session.renderState(performance.now()).others.values()] : []);
  // others()/othersFull() are about players; units() includes monsters.
  const others = () => all().filter((o) => o.kind === 'player');
  (window as unknown as { __thalandor: unknown }).__thalandor = {
    game,
    playerCount: () => (game.scene.isActive('game') ? (game.scene.getScene('game') as GameScene).drawnPlayers : 0),
    selfPos: () => (current ? (current.session.renderState(performance.now()).self?.pos ?? null) : null),
    selfClass: () => current?.character.classId ?? null,
    others: () => others().map((o) => ({ name: o.name, ...o.pos })),
    othersFull: () => others().map((o) => ({ name: o.name, classId: o.classId, appearance: o.appearance })),
    saveNow: () => current?.saver.saveNow(),
    units: () => all().map((o) => ({ id: o.id, kind: o.kind, type: o.type, name: o.name, hp: o.hp, maxHp: o.maxHp, state: o.state, x: o.pos.x, y: o.pos.y })),
    self: () => {
      const s = current?.session.renderState(performance.now()).self;
      return s ? { hp: s.hp, maxHp: s.maxHp, state: s.state, x: s.pos.x, y: s.pos.y } : null;
    },
    me: () => current?.session.meState ?? null,
    /** World -> page pixel coordinates (the canvas sits at the page origin). */
    toScreen: (x: number, y: number) => {
      const cam = (game.scene.getScene('game') as GameScene).cameras.main;
      return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
    },
  };
}
