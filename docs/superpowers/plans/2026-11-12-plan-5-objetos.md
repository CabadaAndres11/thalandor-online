# Plan 5 — Objetos, botín y economía: plan de implementación

> Ejecución nativa (superpowers:executing-plans). Spec: `docs/superpowers/specs/2026-11-12-plan-5-objetos-design.md`.

## Global Constraints
- **Valores fijados por la spec:**
  - 30 casillas de inventario y 11 ranuras de equipo.
  - Probabilidades de botín, valor y oro según la spec.
  - Venta al 25 % y durabilidad −10 al morir.
  - Pociones al 35 %, con 30 s de recarga compartida y pilas de 20.
- **Requisito de nivel:** no se equipan objetos de nivel superior.
- **Venta:** solo con el mercader abierto.
- **Formato del guardado:** versión 3, con migración desde la 2.
- **Textos:** todos en `data/i18n/es.json`.
- **Versión del juego:** 0.5.0.
- **Git:** rama `plan-5-objetos`; commits en inglés con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Un cliente modificado envía objetos imposibles** (afijos fuera de rango, base inexistente, uid duplicado, nivel 99). Se descartan (`forged items are dropped on join`).
2. **Recoger el botín de otro jugador, o desde lejos.** Se rechaza (`pickup only own loot in range`).
3. **Vender sin mercader, o duplicar objetos con peticiones repetidas.** Se rechaza (`sell needs the merchant`, `no duplication on repeated requests`).
4. **Equipar por encima del nivel o un tipo de otra clase.** Se rechaza.
5. **Personaje v2 cargado o importado.** Migra a v3 sin perder nada (`migrates v2 to v3`).

---

### Task 1: Arte del equipo
- **`tools/lpc-selection.json`:**
  - Nueva sección `gear`: aspecto → ranura, más capas por cuerpo con paleta de metal o tela.
  - Etiqueta `slot` en las capas de los atuendos por defecto.
- **Importador:** material `metal`; `buildCatalog` emite `layers.gear`.
- **`resolveLayers(classId, appearance, gear)`:** sustituye las capas por defecto de cada ranura equipada.
- **Carga:** las hojas del equipo se cargan en segundo plano y los avatares se reconstruyen al terminar.
- **Tests:** las capas sustituyen a las de la ranura; existen todas las hojas; créditos.

### Task 2: Datos y tiradas de objetos
- **Datos:** `data/items/{bases,affixes,loot}.json`.
- **`src/sim/items/`:**
  - `defs.ts` (tipos y validación de datos).
  - `roll.ts` (botín, rareza, afijos, oro y valor).
  - `stats.ts` (modificadores de un objeto y del equipo, durabilidad).
  - `validate.ts` (sanear objetos del cliente).
- **Tests:** tiradas con rng fijo, rangos, sin repeticiones, validación y `forged items are dropped on join`.

### Task 3: Inventario, equipo, mercader y guardado v3
- **`src/sim/items/inventory.ts`:** añadir, equipar o quitar, apilar pociones, usar poción, comprar, vender y reparar.
- **Unidad:** gana `gold`, `inventory`, `equipment` y `potionCdUntil`. `rebuildPlayer` suma los modificadores del equipo.
- **Muerte:** reduce la durabilidad del equipo.
- **Guardado:** `src/save/character.ts` pasa a v3 con migración.
- **Tests:** reglas de equipar, inventario lleno, apilado, venta y reparación, `migrates v2 to v3`.

### Task 4: Botín en el mundo y red
- **`World`:** `groundLoot` por dueño, botín al morir el monstruo, recogida al pasar por encima, caducidad y mercader (posición en el mapa).
- **Protocolo:**
  - Peticiones de objetos dentro de `progress-req`.
  - Mensaje `inventory`.
  - Eventos `loot`, `lootGone` y `pickup` (filtrados por dueño).
  - Aspecto equipado en el roster.
- **Host:** validación en `hello`, comandos `/dev item` y `/dev gold`, `inventory` cuando cambia.
- **Tests:** `pickup only own loot in range`, `sell needs the merchant`, `no duplication on repeated requests`, roster con el equipo.

### Task 5: Cliente
- **Sesión:** `ClientSession` gestiona `inventory` y los eventos de botín; `AutoSaver.saveInventory`.
- **Ventanas:** Inventario (I), equipo en Personaje (C) y Mercader (E cerca del PNJ).
- **Suelo:** botín con brillo y nombre; PNJ mercader con nombre.
- **HUD:** pociones en Q y R.
- **Verificación** en la vista previa.

### Task 6: E2E, documentación, revisión y publicación
- **E2E:**
  - Botín, equipar y cambio de aspecto.
  - Mercader.
  - Pociones.
  - Persistencia al recargar.
- **Cierre:** GDD §8 implementado, versión 0.5.0, revisión final, fusionar y publicar.
