# Plan 2 — Personajes y estilo visual: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada jugador crea, guarda, exporta e importa hasta 8 personajes con arte LPC. En la partida, solo o en grupo, cada uno se ve con su clase y su apariencia, animado al andar, y reaparece donde lo dejó.

**Architecture:** El trabajo se reparte en tres frentes:
- **Arte:** un script de importación copia solo las capas LPC elegidas, y genera el catálogo de apariencias y `CREDITS.md`.
- **Personajes:** el modelo de personaje y su almacenamiento (IndexedDB o memoria) viven en `src/save/`.
- **Red y dibujo:**
  - El protocolo amplía `hello` con el personaje.
  - Añade un mensaje `roster`, que es fiable.
  - Las instantáneas incluyen `facing` y `moving`.
  - El cliente dibuja a cada jugador como una pila de capas LPC (`Container` de Phaser) y usa un `<canvas>` para las vistas previas.

**Tech Stack:** TypeScript, Phaser 3, Vite, Vitest, Playwright, `fake-indexeddb` (solo para tests).

**Spec:** `docs/superpowers/specs/2026-11-11-plan-2-personajes-design.md` (y `docs/GDD.md`, §2.3, §4.8, §9.1, §10 y §11).

## Global Constraints

- **Presupuesto 0 €:** solo assets y dependencias gratuitos. Cada capa LPC usada debe aparecer en `CREDITS.md` con sus autores, su licencia y sus URL.
- **Permisos:** antes de cualquier descarga (repositorio LPC, tilesets) o instalación (`fake-indexeddb`) se pide permiso al usuario, indicando la fuente y el tamaño.
- **Descargas:** van a una carpeta nueva **fuera** de `D:\RPG` (por ejemplo `D:\lpc-src`). Los scripts nunca se ejecutan desde dentro de esa carpeta.
- **Textos:** todo texto visible va en `data/i18n/es.json`, y los textos que introduce el jugador se insertan siempre con `textContent`.
- **Versión del juego:** `GAME_VERSION` pasa a `0.2.0` (`package.json`).
- **Escala:**
  - `TILE_SIZE = 32`, `PLAYER_SPEED = 120`, `PLAYER_RADIUS = 10`.
  - Zoom de cámara 1,5.
- **Personajes:**
  - `MAX_CHARACTERS = 8`.
  - Nombre de 2 a 16 caracteres que cumpla `^[\p{L}\p{N} '\-]+$`u, sin repetir entre los propios personajes (sin distinguir mayúsculas).
- **`facing`:** 0 arriba, 1 izquierda, 2 abajo, 3 derecha (el orden de las filas de andar de LPC).
- **Guardado automático:** cada 30 s, al pulsar Salir, al desconectarse y en `pagehide`.
- **Git:** se trabaja en la rama `plan-2-personajes`. Commits en inglés, terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Importar un archivo de una versión futura del juego** (`schemaVersion` mayor que la actual). Debe rechazarse con un mensaje claro, sin guardar nada a medias (Task 3, test `rejects future schemaVersion`).
2. **El navegador bloquea IndexedDB** (modo privado, sin cuota). El juego sigue funcionando con almacén en memoria y muestra el aviso (Task 4, test `falls back to memory store when IndexedDB open fails`).
3. **Nombres con HTML o emoji, o solo con espacios.** Deben rechazarse por las reglas de nombre y no inyectarse nunca en la página (Task 3, test `rejects names with markup, emoji or only spaces`).
4. **Ubicación guardada dentro de un muro** (por ejemplo, el mapa cambió). Se aparece en el punto de aparición, no atrapado (Task 6, test `spawns at map spawn when saved location is solid or other map`).
5. **Una hoja de sprite que falta en el despliegue** (404 bajo la subruta de GitHub Pages). Todas las rutas del catálogo deben existir en `public/` (Task 2, test `every catalog sheet exists in public/`).

---

## Estructura de archivos

```
tools/lpc-selection.json        Capas LPC elegidas (rutas de origen → ids del catálogo) y créditos extra (tiles)
tools/import-lpc.ts             CLI: copia las hojas, escribe catalog.json y CREDITS.md
tools/lpc-import-lib.ts         Funciones puras de la importación (con tests)
public/assets/lpc/...           Hojas importadas (characters/, tiles/)
data/appearance/catalog.json    Catálogo generado
CREDITS.md                      Generado
src/appearance/catalog.ts       Tipos del catálogo, resolveLayers, defaultAppearance, isValidAppearance
src/appearance/lpc-frames.ts    Geometría de los fotogramas LPC (fila/columna de andar)
src/save/character.ts           Modelo Character, validateName, createCharacter, parseCharacter, migraciones
src/save/store.ts               CharacterStore: IndexedDB y memoria, con openCharacterStore()
src/save/transfer.ts            planImport (puro), exportFileName, downloadCharacter, readCharacterFile
src/client/autosave.ts          AutoSaver
src/sim/facing.ts               facingFromVector
src/client/render/lpc-avatar.ts Container de Phaser con las capas de un personaje
src/client/render/preview.ts    Vista previa en <canvas> (menús)
src/client/ui/screens.ts        Pantallas de selección y creación (sustituye al menú de overlay.ts)
```

---

### Task 1: Importación de assets LPC

**Files:**
- Create: `tools/lpc-selection.json`, `tools/lpc-import-lib.ts`, `tools/lpc-import-lib.test.ts`, `tools/import-lpc.ts`, `tools/fixtures/lpc-mini/` (mini repositorio LPC falso para los tests)
- Output (se sube): `public/assets/lpc/**`, `data/appearance/catalog.json`, `CREDITS.md`

**Interfaces:**
- **`lpc-selection.json`:**
  - `{ characters: { bodies, skins, hairStyles, hairColors, classOutfits }, tiles: { file, source, credits } }`.
  - Cada capa referencia una ruta **relativa a `spritesheets/`** del repositorio LPC.
- **Produces** (`lpc-import-lib.ts`):
  - `interface LpcCredit { file: string; authors: string[]; licenses: string[]; urls: string[] }`
  - `readCredits(repoDir: string): Map<string, LpcCredit>` lee las entradas `credits` de los JSON de definición de hojas del repositorio (`sheet_definitions/**/*.json`), indexadas por el campo `file`.
  - `creditFor(sheetPath: string, credits: Map<string, LpcCredit>): LpcCredit | null` busca por coincidencia exacta y, si no la hay, por la carpeta padre más larga.
  - `buildCatalog(selection): AppearanceCatalog` usa el tipo de Task 2.
  - `renderCreditsMd(entries: { file: string; credit: LpcCredit }[], extra: LpcCredit[]): string` produce Markdown ordenado por ruta, con la cabecera fija `# Créditos de arte`.

- [ ] **Step 1: Pedir permiso al usuario** para clonar `https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator`.
  - Clonado superficial: `git clone --depth 1` en `D:\lpc-src`.
  - Antes, consultar el tamaño con `gh api repos/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator --jq .size` (está en KB).
  - Pedir también permiso para el tileset ["LPC Tile Atlas"](https://opengameart.org/content/lpc-tile-atlas), indicando el nombre, el origen y el tamaño del archivo.
  - Si el usuario rechaza alguna descarga, parar y preguntar.
- [ ] **Step 2: Inspeccionar el repositorio descargado.**
  - Comprobar la estructura de `spritesheets/`, el formato de las definiciones con `credits` y la disposición de las hojas: universal de 832×1344 (13 columnas × 21 filas de 64 px), o una hoja por animación.
  - Anotar en el ledger un `Ruling:` con la estructura real.
  - Rellenar `tools/lpc-selection.json` con las capas de la spec §1.2:
    - 2 cuerpos.
    - De 6 a 8 pieles.
    - Unos 8 peinados, cada uno en unos 8 colores.
    - Ropa y arma de cada clase para ambos cuerpos.
    - El tile atlas con sus créditos (de la página de OpenGameArt).
- [ ] **Step 3: Escribir los tests que fallan** en `tools/lpc-import-lib.test.ts`, usando `tools/fixtures/lpc-mini/` (2 definiciones y 3 PNG vacíos).
  - `readCredits indexes credits by file`.
  - `creditFor falls back to parent folder`.
  - `buildCatalog maps selection ids and keeps zIndex order`.
  - `renderCreditsMd lists every sheet with authors, licenses and urls`.
  - `import fails when a selected sheet has no credit`: `importLpc` lanza un error que nombra la hoja.
- [ ] **Step 4:** `npx vitest run tools`. Se espera FAIL.
- [ ] **Step 5:** Implementar `lpc-import-lib.ts` e `import-lpc.ts`.
  - El CLI es `npx tsx tools/import-lpc.ts <repoDir> <tilesDir>`.
  - Copia los archivos con `fs.cpSync`, conservando las rutas relativas bajo `public/assets/lpc/characters/`.
  - Escribe los dos archivos generados.
- [ ] **Step 6:** `npx vitest run tools`. Se espera PASS.
- [ ] **Step 7:** Ejecutar la importación real. Se espera:
  - que existan `public/assets/lpc/`, `data/appearance/catalog.json` y `CREDITS.md`;
  - que el tamaño de `public/assets/lpc` (`du -sh`) sea menor de 15 MB.
- [ ] **Step 8:** Crear la rama `plan-2-personajes` y hacer commit con el mensaje `feat(assets): import selected LPC layers with generated credits`.

---

### Task 2: Catálogo de apariencias y geometría de fotogramas

**Files:**
- Create: `src/appearance/catalog.ts`, `src/appearance/catalog.test.ts`, `src/appearance/lpc-frames.ts`, `src/appearance/lpc-frames.test.ts`
- Modify: `data/i18n/es.json` (etiquetas `appearance.*` y `class.*`)

**Interfaces:**
- **Produces** (`catalog.ts`):
  - `type ClassId = 'warrior' | 'cleric' | 'mage' | 'explorer'` y `CLASS_IDS: readonly ClassId[]`.
  - `interface Appearance { body: string; skin: string; hairStyle: string; hairColor: string }`.
  - `interface LayerRef { sheet: string; zIndex: number }`, donde `sheet` es una ruta bajo `assets/lpc/characters/`.
  - `interface AppearanceCatalog { bodies: Opt[]; skins: Opt[]; hairStyles: Opt[]; hairColors: (Opt & { swatch: string })[]; layers: { body: Record<body, Record<skin, LayerRef>>; hair: Record<hairStyle, Record<hairColor, LayerRef>>; outfit: Record<ClassId, Record<body, LayerRef[]>> } }`, con `Opt = { id: string; labelKey: string }`.
  - `CATALOG: AppearanceCatalog` (importado de `data/appearance/catalog.json`).
  - `isValidAppearance(a: unknown): a is Appearance`.
  - `defaultAppearance(classId: ClassId): Appearance` usa el primer cuerpo, piel, peinado y color.
  - `resolveLayers(classId: ClassId, a: Appearance): LayerRef[]` devuelve las capas ordenadas por `zIndex` ascendente.
- **Produces** (`lpc-frames.ts`):
  - `FRAME_SIZE = 64`, `WALK_FRAMES = 9` (el fotograma 0 es el de reposo) y `WALK_FPS = 10`.
  - `walkFrameRect(facing: number, frame: number): { x: number; y: number; w: number; h: number }`, según la disposición anotada en el ruling de Task 1. Con la hoja universal: `x = frame*64` e `y = (8+facing)*64`.

- [ ] **Step 1: Escribir los tests que fallan.**
  - `resolveLayers orders by zIndex and includes body, hair and class outfit`.
  - `defaultAppearance is valid for every class`.
  - `isValidAppearance rejects unknown ids and non-objects`.
  - `every catalog sheet exists in public/`: recorre todas las `LayerRef.sheet` y comprueba con `fs.existsSync` que existe `public/<sheet>`.
  - `every labelKey exists in es.json`.
  - `walkFrameRect`: `(2,0)` da `{x:0,y:640,w:64,h:64}` y `(3,8)` da `{x:512,y:704,…}`, con la hoja universal.
- [ ] **Step 2:** `npx vitest run src/appearance`. Se espera FAIL.
- [ ] **Step 3:** Implementar y añadir las etiquetas a `es.json`.
  - Nombres de clase: `class.warrior` "Guerrero", `class.cleric` "Clérigo", `class.mage` "Mago", `class.explorer` "Explorador".
  - Roles: `class.warrior.role` "Tanque o daño cuerpo a cuerpo", `class.cleric.role` "Sanador o daño sagrado", `class.mage.role` "Daño mágico en área o control", `class.explorer.role` "Daño a distancia o asesino".
- [ ] **Step 4:** `npx vitest run src/appearance`. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(appearance): catalog, layer resolution and LPC frame geometry`.

---

### Task 3: Modelo de personaje

**Files:**
- Create: `src/save/character.ts`, `src/save/character.test.ts`
- Modify: `data/i18n/es.json` (claves `name.*` y `import.*`)

**Interfaces:**
- **Consumes:** `ClassId`, `Appearance`, `isValidAppearance` y `defaultAppearance` (Task 2).
- **Produces:**
  - `CURRENT_SCHEMA = 1` y `MAX_CHARACTERS = 8`.
  - `interface Character` (tal cual la spec §2.1).
  - `type NameError = 'name.tooShort' | 'name.tooLong' | 'name.invalidChars' | 'name.duplicate'`. Son claves de i18n.
  - `validateName(name: string, existingNames: string[]): { ok: true; name: string } | { ok: false; error: NameError }`. Si es válido, `name` se devuelve recortado.
  - `createCharacter(input: { name: string; classId: ClassId; appearance: Appearance }, now = Date.now(), id = crypto.randomUUID()): Character`, con nivel 1, `xp` 0 y `lastLocation` null.
  - `parseCharacter(raw: unknown): { ok: true; character: Character } | { ok: false; error: 'import.invalid' | 'import.future' }`.
  - `migrations: Record<number, (c: any) => any>`. Para la versión 1 está vacío, pero `parseCharacter` aplica las migraciones en bucle desde `raw.schemaVersion` hasta `CURRENT_SCHEMA`.
- **Textos de `es.json`:**

| Clave | Texto |
|---|---|
| `name.tooShort` | "El nombre debe tener al menos 2 caracteres" |
| `name.tooLong` | "El nombre puede tener como máximo 16 caracteres" |
| `name.invalidChars` | "Usa solo letras, números, espacios, guiones y apóstrofos" |
| `name.duplicate` | "Ya tienes un personaje con ese nombre" |
| `import.invalid` | "El archivo no es un personaje válido de Thalandor" |
| `import.future` | "Este personaje es de una versión más nueva del juego. Actualiza la página." |

- [ ] **Step 1: Escribir los tests que fallan.**
  - **Nombres:**
    - `validateName trims and accepts "  Ñandú d'Or-2 "`.
    - `rejects names with markup, emoji or only spaces`: `"<b>x</b>"` da `invalidChars`, `"Ana😀"` da `invalidChars` y `"   "` da `tooShort`.
    - `rejects 1 and 17 chars`.
    - `rejects duplicate case-insensitively`.
  - **Creación:** `createCharacter sets level 1, xp 0, null location, schemaVersion 1`.
  - **Lectura:**
    - `parseCharacter round-trips a created character`.
    - `parseCharacter replaces unknown appearance with class default`.
    - `parseCharacter rejects missing fields, wrong classId, non-object`, todos con `import.invalid`.
    - `rejects future schemaVersion`: `schemaVersion: 2` da `import.future`.
  - **Migraciones:** `migrations run in order`. Se inyecta una migración de prueba `0→1`, con `vi` o con un parámetro opcional de `parseCharacter`.
- [ ] **Step 2:** `npx vitest run src/save/character.test.ts`. Se espera FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run src/save/character.test.ts`. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(save): character model, name rules and versioned parsing`.

---

### Task 4: Almacén de personajes

**Files:**
- Create: `src/save/store.ts`, `src/save/store.test.ts`

**Interfaces:**
- **Consumes:** `Character` (Task 3).
- **Produces:**
  - `interface CharacterStore { readonly persistent: boolean; list(): Promise<Character[]>; get(id: string): Promise<Character | undefined>; put(c: Character): Promise<void>; delete(id: string): Promise<void> }`.
  - `list()` ordena por `createdAt`.
  - `class MemoryCharacterStore implements CharacterStore` (`persistent = false`).
  - `openCharacterStore(idb: IDBFactory | undefined = globalThis.indexedDB): Promise<CharacterStore>`. Usa la base de datos `thalandor` (versión 1) con el almacén `characters` y `keyPath: 'id'`. Si `idb` no existe o la apertura falla o se bloquea, devuelve un `MemoryCharacterStore`.

- [ ] **Step 1: Pedir permiso** para `npm i -D fake-indexeddb` (gratuita, solo para tests) e instalarla.
- [ ] **Step 2: Escribir los tests que fallan.** Usan `import { IDBFactory } from 'fake-indexeddb'` con una factoría nueva en cada test.
  - `put, get, list and delete roundtrip`.
  - `list is ordered by createdAt`.
  - `data persists across reopen with same factory`.
  - `falls back to memory store when IndexedDB open fails`: una factoría falsa cuyo `open` dispara `onerror` da `persistent === false` y el almacén sigue funcionando.
  - `falls back when indexedDB is undefined`.
- [ ] **Step 3:** `npx vitest run src/save/store.test.ts`. Se espera FAIL.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** `npx vitest run src/save/store.test.ts`. Se espera PASS.
- [ ] **Step 6:** Hacer commit con el mensaje `feat(save): IndexedDB character store with memory fallback`.

---

### Task 5: Exportar e importar

**Files:**
- Create: `src/save/transfer.ts`, `src/save/transfer.test.ts`
- Modify: `data/i18n/es.json` (`import.full`, `import.replaceConfirm`)

**Interfaces:**
- **Consumes:** `parseCharacter`, `validateName`, `MAX_CHARACTERS` y `Character`.
- **Produces:**
  - `type ImportPlan = { kind: 'add'; character: Character } | { kind: 'replace'; character: Character } | { kind: 'error'; error: 'import.invalid' | 'import.future' | 'import.full' }`.
  - `planImport(raw: unknown, existing: Character[]): ImportPlan`.
    - Si el `id` coincide con uno existente, el resultado es `replace`, y la interfaz pide confirmación.
    - Si no, y ya hay `MAX_CHARACTERS`, el resultado es `error import.full`.
    - Si el nombre choca con otro personaje, se le añade el sufijo `" 2"`, `" 3"`… hasta que `validateName` lo acepte. El sufijo puede requerir recortar el nombre base para no pasar de 16 caracteres.
  - `exportFileName(c: Character): string` devuelve `thalandor-<nombre>.json`, con los espacios convertidos en `-` y quitando todo carácter que no sea `[\p{L}\p{N}_-]`.
  - Funciones del navegador sin lógica (sin test): `downloadCharacter(c)` (un Blob y un `<a download>`) y `readCharacterFile(file: File): Promise<unknown>`, que devuelve `null` si el JSON no se puede leer.
- **Textos de `es.json`:**

| Clave | Texto |
|---|---|
| `import.full` | "Ya tienes 8 personajes. Borra uno para importar otro." |
| `import.replaceConfirm` | "Ya tienes este personaje ({name}). ¿Sustituirlo por el del archivo?" |

- [ ] **Step 1: Escribir los tests que fallan.**
  - `new character is added`.
  - `same id plans replace`.
  - `full roster rejects with import.full`.
  - `duplicate name gets " 2" suffix`.
  - `suffix keeps name within 16 chars`.
  - `corrupt input (null, string, partial object) gives import.invalid`.
  - `exportFileName sanitizes "Ana María/<x>"` devuelve `"thalandor-Ana-Maríax.json"`.
- [ ] **Step 2:** Ejecutar los tests. Se espera FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Ejecutar los tests. Se espera PASS.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(save): character export/import planning`.

---

### Task 6: Escala, mapa LPC, orientación y protocolo de personaje

**Files:**
- Create: `src/sim/facing.ts`, `src/sim/facing.test.ts`
- Modify:
  - `src/sim/constants.ts` (`TILE_SIZE` 32, `PLAYER_SPEED` 120, `PLAYER_RADIUS` 10).
  - `tools/gen-test-arena.ts`, que pasa a usar el tileset LPC importado, y regenerar `data/maps/test-arena.json`.
  - `src/sim/world.ts`, `src/net/protocol.ts`, `src/host/host-session.ts`, `src/host/host.worker.ts` y `src/host/worker-host.ts`.
  - `package.json` (versión `0.2.0`).
  - Los tests existentes que dependan de los valores antiguos, sobre todo los desplazamientos por tick, que pasan de 4 px a 6 px.

**Interfaces:**
- **Consumes:** `ClassId`, `Appearance`, `isValidAppearance` y `defaultAppearance` (Task 2).
- **Produces:**
  - `facingFromVector(dx: number, dy: number, prev: Facing): Facing` en `facing.ts`.
    - Con `Facing = 0 | 1 | 2 | 3`.
    - Si el vector es (0, 0), devuelve `prev`.
    - Si `|dx| >= |dy|`, devuelve 1 o 3; si no, 0 o 2.
  - **`World`:**
    - `addPlayer(info: { name: string; classId: ClassId; appearance: Appearance }, at?: Vec2): PlayerState`.
    - `PlayerState` añade `classId`, `appearance`, `facing` y `moving`.
    - `step()` fija `moving` según la última entrada aplicada y `facing` según el movimiento o, si está quieto, según el apuntado respecto a la posición.
    - `PlayerSnapshot` añade `facing: number` y `moving: boolean`.
    - `isSpawnable(p: Vec2): boolean` indica si el círculo `PLAYER_RADIUS` centrado en `p` no toca ningún tile sólido.
  - **Protocolo:**
    - `NetCharacter = { name: string; classId: ClassId; appearance: Appearance; lastLocation: { mapId: string; x: number; y: number } | null }`.
    - El cliente envía `{ t: 'hello'; version: string; character: NetCharacter }`.
    - El host envía `{ t: 'roster'; players: { id: EntityId; name: string; classId: ClassId; appearance: Appearance }[] }`.
    - `decodeClient` y `decodeHost` validan sus campos. La apariencia solo se comprueba como forma; su validez la decide el host.
  - **`HostSession`, al recibir `hello`:**
    - Una clase inválida se sustituye por `warrior` y una apariencia inválida por `defaultAppearance(clase)`.
    - Aparece en `lastLocation` si su `mapId` es el de la sesión y `world.isSpawnable(punto)`; si no, en el punto de aparición.
    - Tras `welcome`, difunde `roster` por el canal fiable, y lo vuelve a difundir en cada `drop`.

- [ ] **Step 1: Escribir los tests que fallan.**
  - **`facing.test.ts`:** los casos de los ejes, `tie goes horizontal` y `zero keeps prev`.
  - **`world.test.ts`:**
    - `snapshot includes facing and moving`: al moverse a la izquierda da `facing 1` y `moving true`; quieto y apuntando abajo da `facing 2` y `moving false`.
    - `isSpawnable false inside wall`.
  - **`protocol.test.ts`:** se actualizan los round-trips para `hello` con personaje y `roster`, y se añade `decode rejects hello without character`.
  - **`host-session.test.ts`:**
    - `invalid classId and appearance are replaced by defaults`.
    - `roster broadcast on join and on leave`.
    - `spawns at saved location when valid`.
    - `spawns at map spawn when saved location is solid or other map`.
  - **Tests existentes:** ajustar los valores de distancia de `movement.test.ts`, `world.test.ts`, `prediction.test.ts`, `host-session.test.ts` y `integration.test.ts` a la nueva escala, usando las constantes en vez de números sueltos donde sea posible.
- [ ] **Step 2:** `npx vitest run`. Se espera FAIL en los tests nuevos y en los ajustados.
- [ ] **Step 3:** Implementar los cambios.
  - Regenerar el mapa con `npx tsx tools/gen-test-arena.ts`.
  - El mapa referencia el tileset importado (`../../public/assets/lpc/tiles/<atlas>.png` en el JSON de Tiled, aunque el juego lo carga por clave).
  - Capas `ground` (hierba y caminos), `collision` (muros de piedra en el borde y en 6 pilares de 2×2) y `decor`.
  - Tiles de 32 px.
- [ ] **Step 4:** `npx vitest run` y `npx tsc --noEmit`. Se espera PASS y ningún error.
- [ ] **Step 5:** Hacer commit con el mensaje `feat: 32px scale, LPC test map, facing and character-aware protocol`.

---

### Task 7: Cliente — roster, avatares LPC y vista previa

**Files:**
- Create: `src/client/render/lpc-avatar.ts`, `src/client/render/preview.ts`, `src/client/render/preview.test.ts`
- Modify: `src/client/client-session.ts` (y su test), `src/client/scenes/BootScene.ts`, `src/client/scenes/GameScene.ts`

**Interfaces:**
- **Consumes:** `resolveLayers`, `walkFrameRect`, `WALK_FRAMES`, `WALK_FPS` y `FRAME_SIZE` (Task 2), el protocolo de Task 6, y `NetCharacter`.
- **Produces:**
  - **`ClientSessionOptions`:** sustituye `name` por `character: NetCharacter`, que se envía en `hello`.
  - **`ClientEvents`:** añade `roster: { players: RosterEntry[] }`.
  - **`RenderState`:**
    - `self` pasa a ser `{ pos: Vec2; facing: number; moving: boolean } | null`.
    - En `self`, `facing` y `moving` se calculan localmente a partir de la última entrada enviada, con `facingFromVector`, para que respondan al instante.
    - Cada entrada de `others` añade `facing`, `moving`, `classId` y `appearance` (estos dos últimos vienen del roster).
  - **`selfLocation(): { x: number; y: number } | null`:** la última posición **oficial** del propio jugador, tomada de la instantánea del host. La usa el `AutoSaver`.
  - **`class LpcAvatar`** (Phaser):
    - `constructor(scene: Phaser.Scene, layers: LayerRef[], name: string)`.
    - `setState(pos: Vec2, facing: number, moving: boolean, timeMs: number): void`.
    - `destroy(): void`.
    - Las capas son `Image` con un recorte (`setCrop`) o el fotograma de la textura.
    - El origen está en los pies: `setOrigin(0.5, 1)` con un desplazamiento vertical constante `FEET_OFFSET_Y`, que se ajusta a ojo y queda anotado en el ledger.
    - Con `moving` alterna los fotogramas 1–8 a `WALK_FPS`; quieto usa el fotograma 0.
  - **`BootScene`:** precarga cada hoja del catálogo como imagen, con la clave igual a la ruta, y el tileset. El `game.events 'booted'` se emite al terminar la carga.
  - **`preview.ts`:**
    - `previewFrame(timeMs: number, facing: number): { facing: number; frame: number }`, pura y con test.
    - `class PreviewCanvas { constructor(canvas: HTMLCanvasElement, scale = 2); setLayers(sheets: string[]): void; setFacing(f: number): void; start(): void; stop(): void }`.
    - Carga las imágenes con `new Image()` y una caché compartida, y dibuja con `drawImage` y `imageSmoothingEnabled = false`.

- [ ] **Step 1: Escribir los tests que fallan.**
  - **`client-session.test.ts`:**
    - `hello carries character`.
    - `roster event and others carry classId/appearance`.
    - `self facing follows last input`.
    - `selfLocation returns authoritative snapshot position`.
  - **`preview.test.ts`:** `previewFrame cycles frames 1..8 at WALK_FPS and keeps facing`.
- [ ] **Step 2:** `npx vitest run src/client`. Se espera FAIL.
- [ ] **Step 3:** Implementar.
  - `GameScene` sustituye los círculos por `LpcAvatar` y dibuja el tilemap desde el JSON de Tiled con el tileset LPC.
  - Capas `ground`, `decor` y `collision`, todas visibles.
  - Zoom 1,5.
- [ ] **Step 4:** `npx vitest run` y `npx tsc --noEmit`. Se espera PASS y ningún error.
- [ ] **Step 5:** Hacer commit con el mensaje `feat(client): LPC avatars, roster and canvas preview`.

---

### Task 8: Pantallas de selección y creación, guardado automático y cableado

**Files:**
- Create: `src/client/ui/screens.ts`, `src/client/autosave.ts`, `src/client/autosave.test.ts`
- Modify: `src/client/ui/overlay.ts` (se queda solo con lo de la partida: HUD, chat, Abrir grupo y Salir), `src/client/main.ts`, `index.html` (estilos), `data/i18n/es.json`

**Interfaces:**
- **Consumes:** `openCharacterStore`, `CharacterStore`, `createCharacter`, `validateName`, `planImport`, `downloadCharacter`, `readCharacterFile`, `CATALOG`, `CLASS_IDS`, `PreviewCanvas` y `resolveLayers`.
- **Produces:**
  - **`class AutoSaver`:**
    - `constructor(opts: { store: CharacterStore; character: Character; mapId: string; getLocation: () => { x: number; y: number } | null; now?: () => number; intervalMs?: number })`.
    - `start(): void` y `stop(): void` (con `setInterval` de 30 000 ms).
    - `saveNow(): Promise<void>` guarda `lastLocation` y `updatedAt`. Si `getLocation()` es null, no guarda.
  - **`class Screens`:**
    - `constructor(root: HTMLElement, store: CharacterStore, handlers: { onPlay(c: Character): void; onJoin(c: Character, code: string): void })`.
    - `showSelection(error?: string): Promise<void>`. Sin personajes, abre directamente la creación.
    - `showCreation(): void`.
    - `setBusy(b: boolean): void`.
    - `setError(msg: string): void`.
- **Claves nuevas de `es.json`:** `select.title` "Tus personajes", `select.create` "Crear personaje", `select.import` "Importar", `select.export` "Exportar", `select.delete` "Borrar", `select.deleteConfirm` "¿Borrar a {name}? No se puede deshacer. Si quieres conservarlo, expórtalo antes.", `select.level` "Nivel {level}", `create.title` "Nuevo personaje", `create.name` "Nombre", `create.class` "Clase", `create.body` "Cuerpo", `create.skin` "Piel", `create.hair` "Peinado", `create.hairColor` "Color de pelo", `create.rotate` "Girar", `create.submit` "Crear", `create.back` "Volver" y `save.unavailable` "Tu progreso no se guardará en este navegador".
- **Comportamiento:**
  - Las pantallas siguen la spec §2.4. Las confirmaciones de borrar y de sustituir al importar usan `confirm()`.
  - Si `store.persistent === false`, las pantallas muestran un aviso permanente con el texto de `save.unavailable`.
  - **En `main.ts`:**
    - `onPlay(c)` y `onJoin(c, code)` crean la sesión con `character: { name, classId, appearance, lastLocation }`.
    - Arrancan el `AutoSaver` con `getLocation = session.selfLocation`.
    - Guardan con `saveNow()` en Salir, en `disconnected` y en `pagehide`.
    - La cámara sigue al propio personaje.
  - El hook de desarrollo `window.__thalandor` añade `selfClass()` y `othersFull()` (con `classId` y `appearance`).

- [ ] **Step 1: Escribir los tests que fallan** en `autosave.test.ts`, con relojes falsos y `MemoryCharacterStore`.
  - `saves lastLocation every 30s`.
  - `saveNow writes current location and updatedAt`.
  - `does not save when location is null`.
  - `stop prevents further saves`.
- [ ] **Step 2:** Ejecutar los tests. Se espera FAIL.
- [ ] **Step 3:** Implementar `AutoSaver`, `Screens`, el cableado de `main.ts`, los estilos y los textos.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit` y `npm run build`, todo en verde.
- [ ] **Step 5: Verificación en la vista previa** (`preview_start thalandor-dev`):
  1. Crear un personaje de cada clase y comprobar que la vista previa cambia con cada selector y gira.
  2. Jugar y comprobar que el sprite anda en las 4 direcciones y choca con los muros.
  3. Salir, recargar y comprobar que aparece en la misma posición.
  4. En una segunda pestaña, con otro personaje, unirse con el código y comprobar que cada uno ve al otro con su clase y su apariencia.
  5. Capturar pantalla.
- [ ] **Step 6:** Hacer commit con el mensaje `feat(client): character selection/creation screens and autosave`.

---

### Task 9: E2E, documentación y cierre

**Files:**
- Modify: `e2e/group.spec.ts`. Sus helpers `hostGame` y `joinGame` pasan a crear antes un personaje, con la clase como parámetro.
- Create: `e2e/characters.spec.ts`
- Modify: `README.md` (controles y personajes) y `docs/GDD.md` (estado de §2.3, §4.8, §9.1, §10 y §11, y registro de cambios)

- [ ] **Step 1: Escribir los tests E2E** en `e2e/characters.spec.ts`. Cada test usa un contexto nuevo, así que cada uno tiene su propia IndexedDB.
  - `create, play, move, leave, reload: character persists and respawns at saved position`: la diferencia con `selfPos` antes de recargar es menor de 2 px.
  - `two players see each other's class and appearance`: con un guerrero y un mago, `othersFull()` devuelve la clase y la apariencia correctas en ambas páginas.
  - `export then import roundtrip`:
    1. Exportar (`page.waitForEvent('download')`).
    2. Borrar el personaje.
    3. Importar el archivo descargado con `setInputFiles`.
    4. Comprobar que la tarjeta vuelve con el mismo nombre.
  - `importing a corrupt file shows an error`: se muestra el texto de `import.invalid`.
  - `create is disabled with 8 characters`.
  - `invalid name shows live validation error`: `"<b>"` muestra el texto de `name.invalidChars`.
- [ ] **Step 2:** Adaptar los helpers de `group.spec.ts` y ejecutar `npm run e2e`. Se espera que pasen todos los tests.
- [ ] **Step 3:** Actualizar el README y el GDD.
- [ ] **Step 4:** Hacer commit con el mensaje `test(e2e): character flows; docs: GDD v0.6`.
