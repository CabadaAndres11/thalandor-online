# Plan 1 — Fundaciones y red: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hasta 4 jugadores, cada uno en su casa, se mueven a la vez por un mapa de prueba en Thalandor Online.
- Uno juega en solitario y en cualquier momento abre grupo con un código.
- Los demás se unen con ese código y pueden chatear.
- El juego está publicado en GitHub Pages.

**Architecture:**
- **Simulación:** host-autoritativo. La simulación (`src/sim/`, TypeScript puro) corre en un Web Worker a 20 ticks/s, envuelta por `HostSession`.
- **Conexión con el worker:** el hilo principal posee las conexiones (PeerJS no funciona dentro de workers) y las reenvía al worker. El jugador del host también se conecta al worker como cualquier invitado.
- **Clientes:** envían entradas numeradas, predicen su propio movimiento y reconcilian con las instantáneas, e interpolan al resto de entidades 100 ms en el pasado.

**Tech Stack:** TypeScript (strict), Vite, Phaser 3, PeerJS, Vitest, Playwright, `peer` (servidor de señalización local, solo para E2E).

**Spec:** `docs/GDD.md`, secciones §1.2, §2, §3, §9.1, §9.4 y §13.

---

## Hoja de ruta de planes (demo completa)

Cada plan deja el juego jugable y probado. Al terminar cada uno se actualiza el GDD (estado de los apartados y registro de cambios) y se escribe el plan siguiente.

| Plan | Contenido | Secciones del GDD |
|---|---|---|
| **1. Fundaciones y red** (este) | Proyecto, simulación de movimiento y colisión, transporte, host en worker, predicción e interpolación, grupo por código, chat, despliegue | §2, §3, §9.1, §9.4, §13 |
| 2. Combate y clases | Motor de estadísticas, motor de habilidades por datos, kits base de las 4 clases, monstruos con IA, amenaza, derribo y muerte, escalado por grupo | §4.1–4.3, §4.6, §5, anexo A |
| 3. Personaje y progresión | Creación y selección (8 huecos), guardado en IndexedDB, exportar e importar, migraciones, experiencia y niveles, atributos, talentos, especializaciones | §4.4–4.8, §10 |
| 4. Objetos y economía | Objetos, rarezas, propiedades, inventario, equipo, botín personal, oro, vendedores, durabilidad, alijo | §8 |
| 5. Mundo y misiones | Pipeline de zonas, transiciones, simulación multizona, "Ir con el grupo", PNJ, misiones, instancias de mazmorra, jefes | §6, §7 |
| 6. Interfaz y arte | HUD completo, ventanas, opciones y reasignación de teclas, selección e integración de packs de assets, audio, `CREDITS.md` | §9.2–9.3, §11 |
| 7. Contenido de la demo | Ciudad y las 4 zonas con sus mazmorras, misiones con textos provisionales y balance de los niveles 1–30 | §6.2, anexo D |

---

## Global Constraints

- **Presupuesto 0 €:** ninguna dependencia, servicio o asset de pago.
- **Plataforma:** PC con Windows, en navegador. El juego se sirve como web estática.
- **Jugadores:** máximo 4 por partida (el host más 3 invitados).
- **Simulación:** `TICK_RATE = 20`, es decir, `TICK_MS = 50`. Retardo de interpolación: `INTERP_DELAY_MS = 100`.
- **Textos:** todo texto visible está en español y se lee desde `data/i18n/es.json`; ningún literal visible en el código.
- **Contenido como datos:** mapas y constantes de contenido en `data/`, nunca escritos dentro del código.
- **Sin anti-trampas,** pero el host **sanea** las entradas: limita rangos y descarta NaN, para que un error no rompa la partida.
- **Control de versiones:** si un invitado tiene una versión distinta a la del host, se le rechaza con el motivo `version`.
- **TypeScript** en modo `strict`. Tests colocados junto al código, como `*.test.ts`.
- **Git:** commits frecuentes y en inglés, terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Sin push** a GitHub ni creación de repositorio remoto sin confirmación del usuario.

## Review Focus

1. **Un invitado cierra la pestaña de golpe.** Puede que no llegue ningún evento de cierre. El host debe eliminarlo en ≤ 5 s y avisar al resto (Task 6, test `drops silent connection after timeout`).
2. **El host cierra la partida o se cae.** Los invitados deben ver "El anfitrión ha cerrado la partida" y volver al menú, no quedarse congelados (Task 7, test `emits disconnected when no snapshot for 5s`).
3. **Código de grupo erróneo o caducado.** Debe salir un error claro "No se encontró la partida" en ≤ 10 s, no una espera infinita (Task 4, test `connect to unknown code rejects with room-not-found`; Task 9, mapeo del error `peer-unavailable`).
4. **Chat con HTML o texto enorme.** Debe mostrarse como texto plano, sin inyección, y recortado a 200 caracteres (Task 6, test `chat is trimmed and empty messages ignored`; Task 10, el render usa `textContent`).
5. **La pestaña del host pasa a segundo plano.** El mundo debe seguir avanzando a 20 ticks/s (Task 8: la simulación corre en el worker; Task 11: E2E con la pestaña del host oculta).

---

## Estructura de archivos

```
D:\RPG
├─ package.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts, index.html
├─ .github/workflows/deploy.yml
├─ data/
│  ├─ i18n/es.json                 Textos de la interfaz
│  └─ maps/test-arena.json         Mapa de prueba (formato Tiled, capas "ground" y "collision")
├─ tools/gen-test-arena.ts         Script que genera test-arena.json
├─ src/
│  ├─ version.ts                   GAME_VERSION
│  ├─ sim/                         Reglas puras, sin DOM
│  │  ├─ constants.ts  types.ts  collision-map.ts  movement.ts  world.ts
│  ├─ net/
│  │  ├─ protocol.ts               Mensajes, encode/decode
│  │  ├─ transport.ts              Interfaces Connection / HostTransport / ClientTransport
│  │  ├─ room-code.ts              Generación de códigos de sala
│  │  ├─ memory-transport.ts       Red en memoria con latencia y pérdida (tests)
│  │  ├─ peer-transport.ts         Implementación PeerJS/WebRTC
│  │  └─ ice-config.ts             Servidores STUN/TURN
│  ├─ host/
│  │  ├─ host-session.ts           Jugadores, entradas, instantáneas, chat, timeouts
│  │  ├─ tick-loop.ts              Bucle de paso fijo
│  │  ├─ worker-protocol.ts        Mensajes entre el hilo principal y el worker
│  │  ├─ host.worker.ts            Entrada del worker
│  │  └─ worker-host.ts            Lado del hilo principal: arranca el worker y reenvía conexiones
│  └─ client/
│     ├─ i18n.ts  server-clock.ts  prediction.ts  interpolation.ts  client-session.ts  input.ts
│     ├─ ui/overlay.ts             Menú, botón "Abrir grupo", chat (HTML sobre el canvas)
│     ├─ scenes/BootScene.ts  scenes/GameScene.ts
│     └─ main.ts                   Arranque y cableado
└─ e2e/group.spec.ts
```

---

### Task 1: Proyecto base

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `src/version.ts`, `src/version.test.ts`, `src/client/main.ts` (provisional, solo crea un juego Phaser vacío)

**Interfaces:**
- Produces: `GAME_VERSION: string` en `src/version.ts`, inyectada por Vite desde `package.json` como `__GAME_VERSION__`. Scripts de npm: `dev`, `build`, `test` (`vitest run`), `e2e` (`playwright test`).

- [ ] **Step 1:** `npm init -y` en `D:\RPG`, con `"name": "thalandor-online"`, `"version": "0.1.0"`, `"private": true` y `"type": "module"`.
- [ ] **Step 2:** Instalar dependencias.
  - `npm i phaser@3 peerjs@1`
  - `npm i -D typescript vite vitest @playwright/test peer tsx`
- [ ] **Step 3:** Configurar los archivos base.
  - `tsconfig.json`: `strict`, `target ES2022`, `module ESNext`, `moduleResolution bundler`, `resolveJsonModule`, `types: ["vite/client"]`.
  - `vite.config.ts`: `base: './'`, que permite servir el juego desde cualquier subruta de Pages, y `define: { __GAME_VERSION__: JSON.stringify(pkg.version) }`.
  - `.gitignore`: `node_modules`, `dist`, `test-results`, `playwright-report`.
- [ ] **Step 4: Escribir el test que falla** en `src/version.test.ts`.
```ts
import { GAME_VERSION } from './version';
test('GAME_VERSION matches package.json', () => {
  expect(GAME_VERSION).toBe('0.1.0');
});
```
- [ ] **Step 5:** `npx vitest run src/version.test.ts`. Se espera FAIL, porque el módulo no existe.
- [ ] **Step 6:** Implementar `src/version.ts` como `export const GAME_VERSION: string = __GAME_VERSION__;`, con su `declare const`. `vitest.config.ts` reutiliza el `define` de Vite.
- [ ] **Step 7:** Comprobar los resultados.
  - `npm test`: PASS.
  - `npm run build`: genera `dist/` sin errores.
- [ ] **Step 8:** Hacer commit con el mensaje `chore: scaffold Vite + TypeScript + Phaser project`.

---

### Task 2: Mapa de colisión y movimiento

**Files:**
- Create: `src/sim/constants.ts`, `src/sim/types.ts`, `src/sim/collision-map.ts`, `src/sim/movement.ts`, `tools/gen-test-arena.ts`, `data/maps/test-arena.json`
- Test: `src/sim/collision-map.test.ts`, `src/sim/movement.test.ts`

**Interfaces:**
- Produces:
  - `constants.ts`: `TICK_RATE = 20`, `TICK_MS = 50`, `TILE_SIZE = 16` (provisional hasta elegir assets), `PLAYER_SPEED = 80` (px/s), `PLAYER_RADIUS = 6`, `MAX_PLAYERS = 4`.
  - `types.ts`: `type EntityId = number`, `interface Vec2 { x: number; y: number }`.
  - `types.ts`: `interface PlayerInput { seq: number; moveX: number; moveY: number; aimX: number; aimY: number }`. `moveX` y `moveY` valen -1, 0 o 1, y `aim` está en coordenadas de mundo.
  - `collision-map.ts`: `class CollisionMap { readonly widthTiles: number; readonly heightTiles: number; constructor(width: number, height: number, solid: Uint8Array); isSolidTile(tx: number, ty: number): boolean; isSolidAt(x: number, y: number): boolean; static fromTiled(json: TiledMap, layerName = 'collision'): CollisionMap }`.
  - `collision-map.ts`: `type TiledMap` con los campos mínimos del formato JSON de Tiled: `width`, `height`, `tilewidth`, y `layers[]` con `name`, `data` y `type`.
  - `movement.ts`: `moveCircle(pos: Vec2, radius: number, dx: number, dy: number, map: CollisionMap): Vec2`.
  - `movement.ts`: `stepPlayerMovement(pos: Vec2, input: PlayerInput, map: CollisionMap): Vec2`, que avanza un tick a `PLAYER_SPEED`.

- [ ] **Step 1: Escribir los tests que fallan.**
  - **`collision-map.test.ts`:**
    - `out of bounds is solid`: `isSolidTile(-1,0)` y `isSolidTile(w,0)` devuelven `true`.
    - `fromTiled reads collision layer`: en un mapa de 3×2 con `data=[0,1,0, 0,0,0]` en la capa `collision`, se cumple `isSolidTile(1,0)===true` y `isSolidTile(0,0)===false`.
    - `fromTiled throws if layer missing`.
  - **`movement.test.ts`:**
    - `diagonal speed is normalized`: con input (1,1) en un mapa vacío, la distancia recorrida en un tick es `PLAYER_SPEED*TICK_MS/1000 = 4` con un margen de 1e-6.
    - `cannot enter solid tile`: avanzando hacia una pared durante 20 ticks, el borde del círculo nunca la penetra.
    - `slides along wall`: con input (1,1) contra una pared vertical, `y` sigue aumentando y `x` se detiene.
    - `zero input does not move`.
- [ ] **Step 2:** `npx vitest run src/sim`. Se espera FAIL.
- [ ] **Step 3:** Implementar. `moveCircle` resuelve cada eje por separado: primero X y luego Y, comprobando las celdas que solapa la caja del círculo. Un tile sólido detiene el movimiento en ese eje, ajustado al borde del tile.
- [ ] **Step 4:** Crear el script `tools/gen-test-arena.ts`, que se ejecuta con `npx tsx`. Genera `data/maps/test-arena.json`.
  - **Tamaño:** 40×30 tiles de 16 px.
  - **Capa `ground`:** todo `1`.
  - **Capa `collision`:** borde perimetral sólido y 6 pilares de 2×2.
  - **Formato:** Tiled JSON (`orientation: orthogonal`, `tilewidth: 16`, `tileheight: 16`). Añade también `properties` con `spawnX` y `spawnY` en el centro.
  - Ejecutarlo y añadir el JSON resultante al repositorio.
- [ ] **Step 5:** `npx vitest run src/sim`. Se espera PASS.
- [ ] **Step 6:** Hacer commit con el mensaje `feat(sim): collision map and circle movement`.

---

### Task 3: Mundo, protocolo y códigos de sala

**Files:**
- Create: `src/sim/world.ts`, `src/net/protocol.ts`, `src/net/room-code.ts`
- Test: `src/sim/world.test.ts`, `src/net/protocol.test.ts`, `src/net/room-code.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces (`world.ts`):
  - `interface PlayerState { id: EntityId; name: string; pos: Vec2; lastInputSeq: number }`
  - `interface WorldSnapshot { tick: number; players: { id: EntityId; name: string; x: number; y: number; lastInputSeq: number }[] }`
  - `class World { tick: number; constructor(map: CollisionMap, spawn: Vec2); addPlayer(name: string): PlayerState; removePlayer(id: EntityId): void; queueInput(id: EntityId, input: PlayerInput): void; step(): void; snapshot(): WorldSnapshot }`
  - `step()` aplica **todas** las entradas pendientes de cada jugador, en orden de `seq` y de una en una, por cada tick de movimiento. Ignora las de `seq <= lastInputSeq` y luego incrementa `tick`.
- Produces (`protocol.ts`):
  - **Del cliente al host:** `{ t: 'hello'; version: string; name: string }` · `{ t: 'input'; input: PlayerInput }` · `{ t: 'chat'; text: string }`.
  - **Del host al cliente:** `{ t: 'welcome'; playerId: EntityId; mapId: string }` · `{ t: 'reject'; reason: 'version' | 'full' }` · `{ t: 'snapshot'; s: WorldSnapshot }` · `{ t: 'chat'; from: string; text: string }` · `{ t: 'left'; playerId: EntityId; name: string }`.
  - **Tipos y funciones:** `type ClientMessage`, `type HostMessage`, `encode(msg: ClientMessage | HostMessage): string`, `decodeClient(raw: string): ClientMessage | null` y `decodeHost(raw: string): HostMessage | null`. Los decodificadores devuelven `null` ante JSON inválido o un `t` desconocido.
- Produces (`room-code.ts`): `ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`, `generateRoomCode(rng: () => number = Math.random): string` (6 caracteres), `normalizeRoomCode(input: string): string | null` (mayúsculas, sin espacios; `null` si no son 6 caracteres válidos) y `peerIdFor(code: string): string` (devuelve `'thalandor-' + code`).

- [ ] **Step 1: Escribir los tests que fallan.**
  - **`world.test.ts`:**
    - `addPlayer spawns at spawn point with incrementing ids`.
    - `queued inputs applied in seq order, one movement tick each`: dos entradas `moveX=1` mueven 8 px en un solo `step()`.
    - `stale inputs ignored`: una entrada con un `seq` ya aplicado no mueve al jugador.
    - `snapshot reflects positions and lastInputSeq`.
    - `removePlayer removes from snapshot`.
  - **`protocol.test.ts`:**
    - `round-trips every message type`.
    - `decode returns null for garbage, unknown t, non-object`.
  - **`room-code.test.ts`:**
    - `generates 6 chars from alphabet`.
    - `normalize accepts ' abc234 ' as 'ABC234'`.
    - `normalize rejects 'ABC10'`, porque tiene 5 caracteres e incluye `0` y `1`, que no están en el alfabeto.
- [ ] **Step 2:** `npx vitest run src/sim src/net`. Se espera FAIL.
- [ ] **Step 3:** Implementar los tres módulos.
- [ ] **Step 4:** `npx vitest run src/sim src/net`. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat: world state, wire protocol, room codes`.

---

### Task 4: Interfaces de transporte y red en memoria

**Files:**
- Create: `src/net/transport.ts`, `src/net/memory-transport.ts`
- Test: `src/net/memory-transport.test.ts`

**Interfaces:**
- Produces (`transport.ts`):
```ts
export type Channel = 'reliable' | 'unreliable';
export interface Connection {
  readonly id: string;
  send(data: string, channel: Channel): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}
export interface HostTransport { readonly code: string; onConnection(cb: (c: Connection) => void): void; close(): void; }
export interface ClientTransport { connect(code: string): Promise<Connection>; }
export class TransportError extends Error { constructor(readonly kind: 'room-not-found' | 'timeout' | 'network', message?: string) }
export const JOIN_TIMEOUT_MS = 10_000;
```
- Produces (`memory-transport.ts`):
  - `createMemoryNetwork(opts?: { latencyMs?: number; lossRate?: number; rng?: () => number }): { createHost(code: string): HostTransport; createClient(): ClientTransport }`.
  - La pérdida (`lossRate`) solo se aplica al canal `unreliable`.
  - La latencia se aplica en ambos sentidos con `setTimeout`.
  - `close()` en un extremo dispara `onClose` en el otro.

- [ ] **Step 1: Escribir los tests que fallan.** Usan `vi.useFakeTimers()`.
  - `delivers reliable messages in order after latency`.
  - `unreliable messages dropped at lossRate with seeded rng`: con `lossRate` 0.5 y un generador determinista, se pierde exactamente lo esperado.
  - `reliable never dropped even with lossRate 1`.
  - `connect to unknown code rejects with room-not-found`: comprueba `TransportError` y `kind`.
  - `close propagates to peer`.
- [ ] **Step 2:** `npx vitest run src/net/memory-transport.test.ts`. Se espera FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run src/net/memory-transport.test.ts`. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(net): transport interfaces and in-memory network`.

---

### Task 5: Bucle de tick de paso fijo

**Files:**
- Create: `src/host/tick-loop.ts`
- Test: `src/host/tick-loop.test.ts`

**Interfaces:**
- Produces: `startTickLoop(step: () => void, opts?: { tickMs?: number; now?: () => number; maxCatchUp?: number }): () => void`.
  - **Valores por defecto:** `tickMs` es `TICK_MS`, `now` es `performance.now` y `maxCatchUp` es `5`.
  - **Devuelve:** una función para detener el bucle.
  - **Funcionamiento:** se planifica con `setTimeout` y un acumulador, y ejecuta `step` tantas veces como ticks hayan vencido, con un máximo de `maxCatchUp` por iteración.

- [ ] **Step 1: Escribir los tests que fallan.** Usan relojes falsos.
  - `runs 20 steps per simulated second`.
  - `catches up missed ticks up to maxCatchUp`: un salto de 1 s ejecuta como mucho 5 pasos en esa iteración y descarta el resto.
  - `stop prevents further steps`.
- [ ] **Step 2:** Ejecutar el test. Se espera FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Ejecutar el test. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(host): fixed-step tick loop`.

---

### Task 6: HostSession

**Files:**
- Create: `src/host/host-session.ts`
- Test: `src/host/host-session.test.ts`

**Interfaces:**
- Consumes: `World` (Task 3), `Connection` (Task 4), `protocol` (Task 3), `MAX_PLAYERS`.
- Produces:
  - `class HostSession { constructor(world: World, opts: { version: string; mapId: string; now?: () => number }); attach(conn: Connection): void; tick(): void; readonly playerCount: number }`
  - `CONN_TIMEOUT_MS = 5000` y `MAX_CHAT_LENGTH = 200`.
- **Comportamiento:**
  - **`hello`:**
    - Si la versión no coincide con la del host, responde `reject 'version'` y cierra.
    - Si ya hay 4 jugadores, responde `reject 'full'` y cierra.
    - Si no, ejecuta `world.addPlayer` y envía `welcome`.
  - **Mensajes antes de `hello`:** se ignoran.
  - **`input`:** se sanea antes de encolarlo.
    - `moveX` y `moveY` se limitan al rango [-1, 1].
    - Un valor no finito se convierte en 0.
    - Un `aim` no finito se sustituye por la posición del jugador.
  - **`tick()`:**
    1. `world.step()`.
    2. Envía `snapshot` por el canal `unreliable` a todos.
    3. Elimina las conexiones sin mensajes durante más de `CONN_TIMEOUT_MS`.
  - **Al cerrar o expirar una conexión:** ejecuta `removePlayer` y difunde `left`.
  - **`chat`:** se recorta con `trim()` y luego a 200 caracteres; si queda vacío, se ignora. Se difunde a todos por el canal `reliable`, con `from` igual al nombre del jugador.
  - **Nombre en `hello`:** se recorta a 16 caracteres; si queda vacío, se usa `"Aventurero"`.

- [ ] **Step 1: Escribir los tests que fallan.** Usan `createMemoryNetwork` con latencia 0 y relojes falsos.
  - `welcomes a matching version`.
  - `rejects version mismatch with reason version`.
  - `rejects 5th player with reason full`.
  - `ignores messages before hello`.
  - `sanitizes input`: con `moveX=5` y `aimX=NaN`, el jugador se mueve a velocidad normal y no aparecen NaN en la instantánea.
  - `broadcasts snapshot each tick with lastInputSeq`.
  - `chat is trimmed and empty messages ignored`: un texto de 500 caracteres llega con 200, y `'   '` no se difunde.
  - `broadcasts left on close`.
  - `drops silent connection after timeout`: sin mensajes durante 5,1 s, el jugador se elimina y se difunde `left`.
- [ ] **Step 2:** Ejecutar los tests. Se espera FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Ejecutar los tests. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(host): host session with join, inputs, snapshots, chat, timeouts`.

---

### Task 7: Cliente — reloj, predicción, interpolación y ClientSession

**Files:**
- Create: `src/client/server-clock.ts`, `src/client/prediction.ts`, `src/client/interpolation.ts`, `src/client/client-session.ts`
- Test: `src/client/*.test.ts` (uno por módulo) y `src/net/integration.test.ts`

**Interfaces:**
- Consumes: Tasks 2 a 6.
- Produces:
  - `class ServerClock { observe(tick: number, receivedAtMs: number): void; serverTimeMs(localMs: number): number }`. El desfase es el mínimo de `receivedAt - tick*TICK_MS` en las últimas 40 observaciones.
  - `class Predictor { constructor(map: CollisionMap); readonly pos: Vec2; applyLocal(input: PlayerInput): void; reconcile(serverPos: Vec2, lastAckSeq: number): void }`. `reconcile` coloca al jugador en `serverPos`, descarta las entradas con `seq <= lastAckSeq` y vuelve a aplicar las pendientes con `stepPlayerMovement`.
  - `class SnapshotBuffer { push(s: WorldSnapshot): void; sample(serverTimeMs: number): Map<EntityId, Vec2> }`.
    - **Interpolación:** lineal entre las dos instantáneas que rodean el instante pedido (`tick*TICK_MS`).
    - **Instante posterior a la última instantánea:** se mantiene la última posición, sin extrapolar.
    - **Memoria:** guarda como máximo 1 s de instantáneas.
  - `class ClientSession`:
    - `constructor(conn: Connection, opts: { version: string; name: string; map: CollisionMap; now?: () => number })`
    - `readonly playerId: EntityId | null`
    - `sendInput(i: Omit<PlayerInput, 'seq'>): void`, que asigna el `seq`, aplica la predicción y envía por `unreliable`.
    - `renderState(localMs: number): { self: Vec2 | null; others: Map<EntityId, { name: string; pos: Vec2 }> }`
    - `on(event: 'welcome' | 'rejected' | 'chat' | 'left' | 'disconnected', cb: (payload) => void): void`
    - `sendChat(text: string): void`
    - `checkTimeout(localMs: number): void`, que emite `disconnected` si no llega ninguna instantánea en 5000 ms o si la conexión se cierra.
  - **Instantes de interpolación:** los otros jugadores se interpolan en `serverTimeMs(now) - INTERP_DELAY_MS`, con `INTERP_DELAY_MS = 100` definido en `constants.ts`.

- [ ] **Step 1: Escribir los tests que fallan.**
  - **`server-clock.test.ts`:** `converges to min offset under jitter`.
  - **`prediction.test.ts`:**
    - `applyLocal moves immediately`.
    - `reconcile replays unacked inputs`: el servidor confirma `seq` 2 de 5, y la posición final es igual a aplicar las entradas 3 a 5 sobre la posición del servidor.
  - **`interpolation.test.ts`:**
    - `interpolates halfway between ticks`.
    - `holds last position beyond newest snapshot`.
    - `entity absent in newer snapshot is dropped`.
  - **`client-session.test.ts`:**
    - `emits welcome and sets playerId`.
    - `emits rejected with reason`.
    - `emits disconnected when no snapshot for 5s`.
    - `emits disconnected on close`.
  - **`src/net/integration.test.ts`:** red en memoria con `latencyMs` 100 y `lossRate` 0.1 (con semilla), un `HostSession` con un tick loop simulado y 3 `ClientSession`.
    - `three clients join and see each other`.
    - `predicted position converges to host within 0.5px after inputs stop`: cada cliente se mueve 2 s y se detiene; tras 1 s, su `self` coincide con la instantánea del host con un margen de 0,5 px.
- [ ] **Step 2:** `npx vitest run src/client src/net/integration.test.ts`. Se espera FAIL.
- [ ] **Step 3:** Implementar los cuatro módulos.
- [ ] **Step 4:** `npm test`. Se espera que toda la suite pase.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(client): prediction, interpolation, client session`.

---

### Task 8: Host en Web Worker

**Files:**
- Create: `src/host/worker-protocol.ts`, `src/host/host.worker.ts`, `src/host/worker-host.ts`
- Test: `src/host/worker-host.test.ts`

**Interfaces:**
- Consumes: `HostSession`, `startTickLoop`, `Connection`, `HostTransport`.
- Produces:
  - `worker-protocol.ts`:
    - **Del hilo principal al worker:** `{ k: 'init'; version: string; mapId: string; mapJson: TiledMap }` · `{ k: 'open'; connId: string }` · `{ k: 'msg'; connId: string; data: string }` · `{ k: 'close'; connId: string }`.
    - **Del worker al hilo principal:** `{ k: 'send'; connId: string; data: string; channel: Channel }` · `{ k: 'kick'; connId: string }`.
  - **`host.worker.ts`:** crea un `World` y un `HostSession`. Por cada `open` crea un `Connection` virtual que traduce entre los mensajes del worker y `HostSession.attach`. Arranca `startTickLoop(() => session.tick())`.
  - **`worker-host.ts`:**
    - `startWorkerHost(opts: { mapId: string; mapJson: TiledMap; workerFactory?: () => WorkerLike }): WorkerHostHandle`.
    - `interface WorkerHostHandle { connectLocal(): Connection; addTransport(t: HostTransport): void; stop(): void }`.
    - `connectLocal()` devuelve el `Connection` del jugador del host, con id `'local'`.
    - `addTransport` reenvía cada conexión entrante al worker.
  - **`WorkerLike`:** la interfaz mínima `{ postMessage(m): void; onmessage: ((e: { data }) => void) | null; terminate(): void }`, para poder probar sin un navegador.

- [ ] **Step 1: Escribir los tests que fallan.** Usan un `WorkerLike` falso que ejecuta en memoria el mismo manejador que `host.worker.ts`. Para ello, el manejador se exporta como `createWorkerHandler(postMessage)` desde `host.worker.ts`.
  - `local client joins through worker and receives snapshots`.
  - `remote connection via memory HostTransport is relayed`.
  - `stop terminates worker and closes connections`.
- [ ] **Step 2:** Ejecutar los tests. Se espera FAIL.
- [ ] **Step 3:** Implementar. En el navegador, `workerFactory` por defecto es `new Worker(new URL('./host.worker.ts', import.meta.url), { type: 'module' })`.
- [ ] **Step 4:** Ejecutar los tests. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(host): run host simulation in a Web Worker`.

---

### Task 9: Transporte PeerJS

**Files:**
- Create: `src/net/peer-transport.ts`, `src/net/ice-config.ts`
- Test: `src/net/peer-transport.test.ts`

**Interfaces:**
- Consumes: `transport.ts`, `room-code.ts`.
- Produces:
  - **`ice-config.ts`:** `getIceServers(): RTCIceServer[]`. Por defecto devuelve `[{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]`, más servidores TURN opcionales si está definida la variable `VITE_TURN_URLS`. Se deja documentado en el código que la alternativa sin coste es Tailscale (GDD §2.5).
  - **`peer-transport.ts`:** `createPeerHost(opts?: PeerOpts): Promise<HostTransport>` y `createPeerClient(opts?: PeerOpts): ClientTransport`.
    - `PeerOpts = { host?: string; port?: number; path?: string; secure?: boolean }`, que se lee de las variables `VITE_PEER_HOST`, `VITE_PEER_PORT` y `VITE_PEER_PATH`. Si no están definidas, se usa el servidor público de PeerJS.
    - **Host:** reintenta con un código nuevo si el id ya está ocupado (error `unavailable-id`), con un máximo de 3 intentos.
    - **Cliente:** abre dos `DataConnection` hacia `peerIdFor(code)`, con etiquetas `rel` (`reliable: true`) y `unrel` (`reliable: false`). Las envuelve en un único `Connection`.
    - **Errores del cliente:** el error de PeerJS `peer-unavailable` se convierte en `TransportError('room-not-found')`; si se agota `JOIN_TIMEOUT_MS`, en `TransportError('timeout')`.
    - **Host:** agrupa las dos `DataConnection` de un mismo peer en un único `Connection`.

- [ ] **Step 1: Escribir los tests que fallan.** Se mockea el módulo `peerjs` con `vi.mock` usando un `FakePeer` que emite eventos.
  - `maps peer-unavailable to room-not-found`.
  - `rejects with timeout after JOIN_TIMEOUT_MS`.
  - `pairs rel and unrel connections into one Connection on host`.
  - `retries with a new code on unavailable-id`.
- [ ] **Step 2:** Ejecutar los tests. Se espera FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Ejecutar los tests. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(net): PeerJS WebRTC transport`.

---

### Task 10: Juego en el navegador — escenas, entradas, interfaz e i18n

**Files:**
- Create: `data/i18n/es.json`, `src/client/i18n.ts`, `src/client/input.ts`, `src/client/ui/overlay.ts`, `src/client/scenes/BootScene.ts`, `src/client/scenes/GameScene.ts`
- Modify: `src/client/main.ts`, `index.html`
- Test: `src/client/i18n.test.ts`, `src/client/input.test.ts`

**Interfaces:**
- Consumes: `startWorkerHost`, `createPeerHost`, `createPeerClient`, `ClientSession`, `normalizeRoomCode`, `GAME_VERSION`.
- Produces:
  - **`i18n.ts`:** `t(key: string, vars?: Record<string, string | number>): string`. Si la clave no existe, devuelve la propia clave y avisa una vez por consola. La interpolación usa `{name}`.
  - **`input.ts`:** `inputFromKeys(keys: { up: boolean; down: boolean; left: boolean; right: boolean }, aimWorld: Vec2): Omit<PlayerInput, 'seq'>`.
- **Claves de `es.json`** (textos exactos):

| Clave | Texto |
|---|---|
| `menu.title` | `Thalandor Online` |
| `menu.name` | `Nombre` |
| `menu.play` | `Jugar` |
| `menu.join` | `Unirse a un amigo` |
| `menu.code` | `Código de grupo` |
| `game.openGroup` | `Abrir grupo` |
| `game.groupCode` | `Código: {code}` |
| `game.copied` | `Copiado` |
| `chat.placeholder` | `Escribe un mensaje…` |
| `chat.joined` | `{name} se ha unido` |
| `chat.left` | `{name} ha salido` |
| `error.roomNotFound` | `No se encontró la partida` |
| `error.timeout` | `No se pudo conectar. Inténtalo de nuevo.` |
| `error.version` | `Tu versión no coincide con la del anfitrión. Recarga la página.` |
| `error.full` | `La partida está llena (máximo 4 jugadores)` |
| `error.hostClosed` | `El anfitrión ha cerrado la partida` |
| `error.badCode` | `El código debe tener 6 caracteres` |

- **Comportamiento:**
  - **Menú (HTML superpuesto al canvas):**
    - Campos de nombre y de código.
    - "Jugar" llama a `startWorkerHost` y a `connectLocal`.
    - "Unirse a un amigo" llama a `normalizeRoomCode` y a `createPeerClient().connect`.
  - **Errores:** se muestran con `t('error.*')`.
  - **Texto del chat y nombres:** siempre se insertan con `textContent`, nunca con `innerHTML`.
  - **`GameScene`:**
    - Dibuja la capa `ground` con un tileset provisional generado en `BootScene`: un color de suelo y otro de muro.
    - Dibuja los jugadores como círculos de colores, uno por índice de jugador, con su nombre encima.
    - La cámara sigue al jugador propio.
    - Lee WASD y envía la entrada **una vez por tick** (cada 50 ms, con acumulador), no por cada frame.
  - **"Abrir grupo"** (solo lo ve el host):
    - Llama a `createPeerHost()` y después a `handle.addTransport`.
    - Muestra `game.groupCode` y copia el código al portapapeles al pulsarlo.
  - **Chat:** Enter abre o envía el mensaje y Esc lo cierra. Mientras el chat está abierto, WASD no mueve al personaje.
  - **Desconexión o rechazo:** muestra el error correspondiente y vuelve al menú.
  - **Versión:** `GAME_VERSION` aparece en una esquina del menú.

- [ ] **Step 1: Escribir los tests que fallan.**
  - **`i18n.test.ts`:**
    - `interpolates vars`: `t('game.groupCode', { code: 'ABC234' })` devuelve `'Código: ABC234'`.
    - `returns key when missing`.
  - **`input.test.ts`:**
    - `opposite keys cancel`.
    - `maps wasd to unit axes`.
    - `passes aim through`.
- [ ] **Step 2:** Ejecutar los tests. Se espera FAIL.
- [ ] **Step 3:** Implementar los módulos, las escenas y el cableado de `main.ts`.
- [ ] **Step 4:** `npm test` (PASS) y `npm run build` (sin errores).
- [ ] **Step 5: Verificación manual con la vista previa.**
  1. Crear `.claude/launch.json` con `npm run dev` en el puerto 5173.
  2. Abrir el juego, pulsar "Jugar" y comprobar que el personaje se mueve con WASD y choca con los muros y pilares.
  3. Pulsar "Abrir grupo" y comprobar que aparece un código de 6 caracteres.
  4. En una segunda pestaña, unirse con ese código y comprobar que cada pestaña ve al otro jugador moverse y que el chat funciona en ambos sentidos.
  5. Capturar pantalla.
- [ ] **Step 6:** Hacer commit con el mensaje `feat(client): playable browser client with group code and chat`.

---

### Task 11: E2E con 4 jugadores y despliegue

**Files:**
- Create: `playwright.config.ts`, `e2e/group.spec.ts`, `.github/workflows/deploy.yml`, `README.md`
- Modify: `docs/GDD.md`: estado de §2, §3 (solo movimiento), §9.1 (parcial), §9.4 y §13 a **[Implementado]**, y nueva entrada en el registro de cambios.

**Interfaces:**
- Consumes: el juego completo.
- **Detalles:**
  - **Servidores de Playwright (`webServer`):**
    - Un servidor de señalización local con `npx peerjs --port 9000 --path /thalandor`.
    - `npm run dev` con las variables `VITE_PEER_HOST=localhost`, `VITE_PEER_PORT=9000` y `VITE_PEER_PATH=/thalandor`.
  - **Navegador:** Chromium, para que no dependa de internet.
  - **Despliegue:** `deploy.yml` se ejecuta con cada push a `main`. Pasos: `npm ci`, `npm test`, `npm run build`, y despliegue con `actions/upload-pages-artifact` y `actions/deploy-pages`.

- [ ] **Step 1: Escribir el test E2E** en `e2e/group.spec.ts`.
  - `four players join one group and see each other`:
    1. La página A pulsa "Jugar" y luego "Abrir grupo", y lee el código.
    2. Las páginas B, C y D se unen con ese código.
    3. Comprobar que cada página dibuja 4 jugadores. Se expone `window.__thalandor.playerCount()` solo en modo dev para que el test lo lea.
  - `host tab hidden keeps world ticking`: con A en segundo plano (`page.evaluate` para cambiar `visibilityState`, o abriendo otra pestaña encima en el mismo contexto), B se mueve 2 s y su posición en la página C avanza más de 100 px.
  - `wrong code shows room not found`: un código inexistente muestra `No se encontró la partida` en menos de 10 s.
  - `chat message reaches all players`.
- [ ] **Step 2:** `npx playwright install chromium` y después `npm run e2e`. Se espera PASS en los 4 tests. Si alguno falla, corregir la causa antes de seguir.
- [ ] **Step 3:** Escribir `README.md`: cómo jugar (enlace), cómo desarrollar (`npm i`, `npm run dev`, `npm test`, `npm run e2e`) y qué hacer si no conecta (Tailscale).
- [ ] **Step 4:** Actualizar el GDD (estado de los apartados y registro de cambios).
- [ ] **Step 5:** Hacer commit con el mensaje `test(e2e): four-player group flow; ci: GitHub Pages deploy`.
- [ ] **Step 6: Publicación. Requiere al usuario.**
  1. Pedirle que cree en GitHub el repositorio público `thalandor-online`, o que autorice instalar `gh` con winget y autenticarse.
  2. Pedir confirmación antes de hacer `git remote add` y `git push`.
  3. Activar Pages con la fuente "GitHub Actions".
  4. Comprobar que la URL publicada carga el menú.
- [ ] **Step 7: Prueba real con amigos.** El usuario abre grupo y sus amigos se unen desde sus casas. Anotar en el GDD si alguno no conecta y si hizo falta TURN o Tailscale.
