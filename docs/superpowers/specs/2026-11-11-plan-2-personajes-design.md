# Plan 2 — Personajes y estilo visual: diseño

> Especificación acordada el 2026-11-11. Amplía el GDD (§2.3, §4.8, §9.1, §10 y §11). Si algo choca con el GDD, manda el GDD, salvo en lo que este documento concreta.

## Objetivo

Que cada jugador cree y guarde sus propios personajes (hasta 8) con arte LPC real, y que en la partida, solo o en grupo, se vea a cada uno con su clase y su apariencia, animado al andar.

**Fuera de alcance**, en planes posteriores: combate, experiencia y niveles, atributos, talentos, especializaciones, objetos y equipo cambiable, y que el host devuelva el personaje completo.

## Nuevo orden de planes

| Plan | Contenido |
|---|---|
| 1 | Fundaciones y red (hecho) |
| **2** | **Personajes y estilo visual** (este) |
| 3 | Combate y clases |
| 4 | Progresión |
| 5 | Objetos y economía |
| 6 | Mundo y misiones |
| 7 | Interfaz completa y audio |
| 8 | Contenido de la demo |

---

## 1. Arte LPC

### 1.1 Obtención
- **Fuente:** se descarga una vez el repositorio [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).
  - Va a una carpeta **fuera** del proyecto.
  - Antes de descargarlo se pide permiso al usuario, indicando el tamaño.
- **Tiles:** también se descargan de OpenGameArt, con permiso previo, los tilesets LPC necesarios: terreno (hierba, caminos) y muros de piedra.
- **Script `tools/import-lpc.ts`:**
  - Recibe por argumento la ruta del repositorio descargado.
  - Copia a `public/assets/lpc/` **solo** las hojas listadas en `tools/lpc-selection.json`.
  - Genera `data/appearance/catalog.json`.
  - Genera `CREDITS.md` a partir de los datos de licencia del repositorio LPC: cada hoja usada con sus autores, su licencia y sus URL.
  - Falla si alguna hoja seleccionada no tiene datos de licencia.
- **Datos importados:** las imágenes y los JSON generados se suben al repositorio. El repositorio LPC descargado no.

### 1.2 Selección de capas
- **Cuerpos:** `male` y `female`, en 6 a 8 tonos de piel.
- **Peinados:** unos 8, cada uno en unos 8 colores.
- **Ropa y arma iniciales por clase**, para ambos cuerpos:

| Clase | Ropa | Arma |
|---|---|---|
| Guerrero | Armadura ligera (cuero o malla) y pantalón | Espada |
| Clérigo | Túnica clara | Maza |
| Mago | Túnica | Bastón |
| Explorador | Ropa de cuero con capucha | Arco |

- **Ajuste fino:** las piezas exactas se escogen al importar, priorizando la coherencia visual. Se documentan en `tools/lpc-selection.json`.

### 1.3 Catálogo de apariencias (`data/appearance/catalog.json`)
- **Entradas:**
  - `bodies`: `{ id, label }`.
  - `skins`: `{ id, label }`.
  - `hairStyles`: `{ id, label }`.
  - `hairColors`: `{ id, label, swatch }`, donde `swatch` es un color CSS para el selector.
  - `classOutfits`: por `classId` y por cuerpo, la lista ordenada de capas.
- **Cada capa** indica la ruta de su hoja y su orden de dibujo (`zIndex`) según LPC.
- **Textos:** las etiquetas visibles son claves de i18n, no textos literales.
- **Función `resolveLayers(classId, appearance)`:** devuelve la lista ordenada de capas a dibujar. La usan el juego y la vista previa.

### 1.4 Dibujo
- **Formato:** hojas LPC universales de 64×64. En este plan se usan las filas de **andar** en 4 direcciones; el fotograma 0 hace de reposo.
- **En el juego:** un personaje es un `Container` de Phaser con un sprite por capa, todos en el mismo fotograma.
- **En los menús:** la vista previa (selección y creación) dibuja las mismas capas en un `<canvas>` con `drawImage`. Se anima a unos 8 fotogramas por segundo y se puede girar.
- **Dirección:**
  - Si el personaje se mueve, la del movimiento.
  - Si está quieto, la del apuntado (ratón respecto al personaje).
  - Se elige el eje dominante. Si empatan, gana el horizontal.
- **Anclaje:** la posición de la simulación son los **pies** del personaje. El sprite se dibuja con origen en la parte inferior central del fotograma, ajustado al dibujo LPC. El nombre va encima de la cabeza.

### 1.5 Escala y mapa
- **`TILE_SIZE` pasa a 32.** Se ajustan los valores para que la sensación de movimiento sea parecida a la actual:
  - `PLAYER_SPEED` = 120 px/s (unos 3,75 tiles/s).
  - `PLAYER_RADIUS` = 10 (colisión en los pies).
- **Mapa de prueba:** `tools/gen-test-arena.ts` genera de nuevo `test-arena` en 40×30 tiles de 32 px, usando los gid del tileset LPC importado:
  - Capa `ground`: hierba con caminos.
  - Capa `collision`: muros de piedra en el borde y en los pilares.
  - Capa `decor` (opcional), que no colisiona.
- **Cámara:** zoom 1,5 y `roundPixels`.

---

## 2. Personaje: datos, pantallas y guardado

### 2.1 Modelo (`src/save/character.ts`)
```ts
type ClassId = 'warrior' | 'cleric' | 'mage' | 'explorer';
interface Appearance { body: string; skin: string; hairStyle: string; hairColor: string }
interface Character {
  schemaVersion: 1;
  id: string;            // crypto.randomUUID()
  name: string;
  classId: ClassId;
  appearance: Appearance;
  level: number;         // 1 en este plan
  xp: number;            // 0 en este plan
  lastLocation: { mapId: string; x: number; y: number } | null;
  createdAt: number;     // ms epoch
  updatedAt: number;
}
```
- **`validateName(name, existingNames)`:**
  - Recorta los espacios de los extremos.
  - Exige entre 2 y 16 caracteres, ajustándose a `^[\p{L}\p{N} '\-]+$`u.
  - No admite un nombre repetido entre los personajes del jugador, sin distinguir mayúsculas.
  - Devuelve `ok` o un motivo, que se muestra como texto i18n.
- **`parseCharacter(unknown)`:** valida, ejecuta las migraciones hasta la versión actual y devuelve `Character` o un error. Una apariencia desconocida se sustituye por la apariencia por defecto de la clase.
- **Migraciones:** `migrations: Record<number, (old) => next>`. En este plan solo existe la versión 1, pero el mecanismo queda montado y con test.

### 2.2 Almacenamiento (`src/save/store.ts`)
- **Interfaz:** `CharacterStore { list(): Promise<Character[]>; get(id); put(c); delete(id) }`.
- **Implementación principal:** IndexedDB (base de datos `thalandor`, almacén `characters`, clave `id`).
- **Si IndexedDB no está disponible o falla al abrir:**
  - Se usa un almacén en memoria.
  - El menú muestra un aviso permanente (`save.unavailable`): "Tu progreso no se guardará en este navegador".
- **Límite:** `MAX_CHARACTERS = 8`. Se comprueba al crear y al importar.

### 2.3 Exportar e importar (`src/save/transfer.ts`)
- **Exportar:** descarga `thalandor-<nombre>.json`, con el `Character` en JSON legible.
- **Importar** (selector de archivo `.json`):
  - El archivo se lee y pasa por `parseCharacter`.
  - **Archivo inválido:** se muestra un error claro y no se modifica nada.
  - **Mismo `id` que un personaje existente:** se pide confirmación para sustituirlo.
  - **Ya hay 8 personajes:** se rechaza con un mensaje.
  - **Nombre repetido con otro `id`:** se importa con el sufijo " 2" (o el siguiente libre que cumpla las reglas).

### 2.4 Pantallas (HTML sobre el canvas; todos los textos en `es.json`)
1. **Selección:**
   - Hasta 8 tarjetas con la vista previa animada, el nombre, la clase y "Nivel 1".
   - Con un personaje seleccionado: **Jugar**, el campo de código con **Unirse a un amigo**, **Exportar** y **Borrar**.
   - **Borrar:** pide confirmación, avisa de que no se puede deshacer y sugiere exportar antes.
   - Generales: **Crear personaje** (desactivado si hay 8) e **Importar**.
   - Sin personajes, se abre directamente la creación.
2. **Creación:**
   - Campo de nombre con validación en vivo.
   - 4 tarjetas de clase, cada una con su rol en una frase.
   - Selectores de cuerpo, piel, peinado y color de pelo.
   - Vista previa grande y animada, con botones para girarla.
   - Botones **Crear** y **Volver**.
- **Dentro de la partida:** no cambia nada respecto al Plan 1 (Abrir grupo, Salir y chat).

---

## 3. Red y partida

### 3.1 Protocolo (`GAME_VERSION` 0.2.0)
- **`hello`:** pasa a ser `{ t: 'hello'; version; character: NetCharacter }`, con `NetCharacter = { name, classId, appearance, lastLocation }`.
- **Validación en el host:**
  - El nombre se recorta como hasta ahora.
  - Una clase inválida se sustituye por `warrior`.
  - Una apariencia inválida se sustituye por la de por defecto de la clase.
- **Nuevo mensaje fiable `roster`:** `{ t: 'roster'; players: { id, name, classId, appearance }[] }`. Se difunde a todos al entrar o salir alguien.
- **Instantánea:** cada jugador añade `facing: 0..3` (0 arriba, 1 izquierda, 2 abajo, 3 derecha: el mismo orden que las filas de andar de LPC) y `moving: boolean`. La simulación los calcula con la regla del eje dominante de §1.4 a partir de la última entrada aplicada.

### 3.2 Aparición
- Si `lastLocation.mapId` coincide con el mapa del host y el punto es transitable para el radio del jugador, se aparece ahí.
- Si no, en el punto de aparición del mapa.

### 3.3 Guardado durante la partida
- **Qué se guarda:** `lastLocation`, con la posición **oficial** del propio jugador en la última instantánea del host, y `updatedAt`.
- **Cuándo:** cada 30 s, al pulsar Salir, al desconectarse y en `pagehide`.
- **Implementación:** un servicio `AutoSaver` en el cliente, con su propio test.

---

## 4. Pruebas

- **Unitarias:**
  - `validateName`.
  - `parseCharacter`: válido, inválido, apariencia desconocida y migración de prueba.
  - `resolveLayers`: orden y capas por clase y cuerpo.
  - `facing`.
  - El almacén IndexedDB con `fake-indexeddb` (dependencia de desarrollo, se pedirá permiso) y el almacén en memoria.
  - Importación: nombre duplicado, mismo id, límite de 8 y JSON roto.
  - `AutoSaver`.
- **Host y red:**
  - `hello` con personaje.
  - Saneado de clase y apariencia.
  - `roster` al entrar y al salir.
  - `facing` y `moving` en la instantánea.
  - Aparición en la ubicación guardada o, si no es válida, en el punto de aparición.
- **E2E (Playwright):**
  - Crear un personaje, jugar, moverse, salir, recargar y comprobar que el personaje persiste y reaparece en su posición.
  - Dos jugadores con clases distintas se ven con la clase y la apariencia correctas, mediante el hook de desarrollo.
  - Exportar e importar ida y vuelta.
  - Importar un archivo corrupto y comprobar que se muestra el error.
  - Con 8 personajes, Crear queda desactivado.
- **Manual (usuario):**
  - Que la vista previa responda.
  - Que el arte sea coherente.
  - Una partida en grupo con amigos.
