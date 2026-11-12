# Plan 3 — Combate y clases: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (elegido: nativo). Pasos con checkbox.

**Goal:** Combate en tiempo real con las 4 clases (kit base completo) contra 4 monstruos con IA, amenaza, derribo y reaparición, con HUD de barras y casillas de habilidad con icono.

**Architecture:**
- **Host:** la simulación pasa de "jugadores" a "unidades" (jugadores y monstruos), con módulos puros en `src/sim/combat/`, `src/sim/abilities/` y `src/sim/monsters/`.
- **Datos:** las habilidades y los monstruos se definen en JSON validados por tests.
- **Protocolo:** las entradas incluyen botones y pulsaciones repetidas hasta su confirmación. La instantánea lleva unidades filtradas por distancia y un bloque privado `me`, y los eventos de combate van por el canal fiable.
- **Cliente:** dibuja las animaciones LPC de ataque, las criaturas, los efectos de Phaser y el HUD en HTML.

**Spec:** `docs/superpowers/specs/2026-11-12-plan-3-combate-design.md` y `docs/GDD.md` (§4, §5 y anexo A).

## Global Constraints

- **Coste:** 0 €. Assets LPC acreditados en `CREDITS.md` mediante el importador.
- **Textos:** todos en `data/i18n/es.json`; los de jugadores, insertados con `textContent`.
- **Simulación:** 20 ticks/s. Todas las reglas son puras y deterministas con un `rng` inyectable.
- **Valores de la spec:** GCD 500 ms; esquiva de 96 px en 150 ms con 300 ms de invulnerabilidad y 3 s de recarga; derribo de 30 s; levantar con E durante 3 s a 48 px o menos, volviendo con un 30 % de vida; reaparición a los 3 s; vida de monstruo `× (1 + 0,75 × (n − 1))`; mitigación por armadura `a/(a+100)` con máximo de 0,75; crítico ×1,5; variación de ±10 %; filtrado de unidades a 800 px.
- **Versión del juego:** 0.3.0.
- **Git:** rama `plan-3-combate`, commits en inglés con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pulsación perdida en la red:** una habilidad pulsada con pérdida de paquetes se ejecuta exactamente una vez (Task 6, `presses survive loss and run once`).
2. **Monstruo atascado tras un pilar:** debe rodearlo (Task 5, `A* routes around pillar`).
3. **Muerte con varios monstruos persiguiendo:** al reaparecer el jugador, no deben quedar persiguiéndolo (Task 3/5, `targets drop dead or downed player`).
4. **Curar a un enemigo o hacer daño a un aliado con el cursor:** no debe pasar nunca (Task 4, `no friendly fire, heals only allies`).
5. **Parpadeo o carga contra un muro:** nunca terminan dentro de un tile sólido (Task 4, `blink stops at last free point`).

---

### Task 1: Assets de combate

**Qué hace:**
- Amplía `tools/lpc-selection.json` con las animaciones `slash`, `thrust`, `spellcast`, `shoot` y `hurt`, por capa y para cada clase.
- Añade las capas de los monstruos humanoides: esqueleto, cabeza de goblin y túnica, y cabeza de orco, armadura y hacha.
- Añade el pack LPC Monsters (murciélago).

**Cambios en el importador:**
- `LayerRef` pasa a tener `sheets: Record<Anim, { path, frameSize }>`. Las hojas grandes (128 o 192 px) se dibujan centradas.
- La geometría de cada animación (número de fotogramas y filas) se define en `src/appearance/lpc-frames.ts`.

**Tests:**
- Las hojas del catálogo existen.
- Cada capa tiene `walk`.
- Las hojas grandes tienen un `frameSize` coherente con su tamaño.
- Hay créditos para cada hoja.

### Task 2: Unidades, estadísticas, daño y recursos

**Qué hace:**
- **`src/sim/combat/stats.ts`:** `computeStats(classId, bonuses)` usa los datos de `data/classes.json` y `data/balance.json`.
- **`damage.ts`:** `resolveHit(src, dst, ability, effect, rng)` devuelve `{ amount, crit, dodged }`.
- **`resources.ts`:** `tickResources(unit, dtMs)`.
- **`unit.ts`:** el tipo `Unit` (jugador o monstruo) con vida, recurso, estados, escudo, `inCombatUntil`, `state` y `team`.
- **`World`:** `units` sustituye a `players`, y se adaptan el host y los tests existentes.

**Tests:** fórmula de estadísticas, mitigación con máximo, crítico, esquiva, rango de variación, ira, maná con y sin *Meditación*, energía, regeneración fuera de combate y escudo.

### Task 3: Amenaza, derribo y reaparición

**Qué hace:**
- **`src/sim/combat/threat.ts`:** tabla por monstruo; `addThreat`, `topTarget` y `dropUnit`.
- **`life.ts`:** derribado, levantar (canal con E, que se interrumpe al moverse o recibir daño) y reaparición.

**Tests:** cambio de objetivo, `targets drop dead or downed player`, levantar, canal interrumpido, reaparición en solitario y cuando todos caen.

### Task 4: Motor de habilidades y kits

**Qué hace:**
- **Ejecución:** `src/sim/abilities/` con `engine.ts` (`tryUse(world, unit, slot, aim)`), `shapes.ts`, `effects.ts`, `projectiles.ts` y `statuses.ts`.
- **Datos:** `data/abilities/{warrior,cleric,mage,explorer,monsters}.json` y `data/abilities/dodge.json`.
- **Ranuras:** `data/classes.json` define `slots: { lmb, rmb, s1, s2, s3, s4 }` y las pasivas de clase.
- **Iconos:** `src/client/hud/icons.ts`, con `icon` en formato `"glyph:color"`.

**Tests:**
- Cada forma y cada efecto.
- `no friendly fire, heals only allies`.
- `blink stops at last free point`.
- Carga contra un muro.
- GCD y recargas, coste insuficiente, aturdido sin poder actuar.
- La esquiva da invulnerabilidad.
- Validación de todos los JSON (efectos conocidos, `nameKey` en `es.json`, iconos con formato válido).

### Task 5: Monstruos

**Qué hace:**
- **`src/sim/monsters/`:** `defs.ts` (que carga `data/monsters/*.json`), `ai.ts` (estados), `pathfinding.ts` (A* sobre `CollisionMap`), `los.ts` (línea de visión) y `spawner.ts` (lee la capa de objetos `spawns` del mapa Tiled).
- **Escalado** por número de jugadores.
- **Mapa:** `tools/gen-test-arena.ts` añade los puntos de aparición.

**Tests:** detección con y sin línea de visión, persecución, retorno con vida reiniciada, `ranged` mantiene la distancia, manada, `A* routes around pillar`, reaparición tras `respawnMs`, escalado.

### Task 6: Protocolo y red

**Qué hace:**
- **Entrada:** `buttons` y `presses` (con `seq`); el host deduplica las pulsaciones.
- **Instantánea:** `units[]` filtradas por distancia (800 px), bloque `me` y `events[]` fiables (un mensaje `events` por tick cuando hay eventos).
- **Predicción:** el `Predictor` del cliente predice la esquiva.
- **`ClientSession`:** expone `renderState().units`, `me` y `on('combat', ...)`.

**Tests:** `presses survive loss and run once`, filtrado por distancia, los eventos llegan a todos, la esquiva predicha coincide con el host, y la integración con 3 clientes y monstruos.

### Task 7: Cliente — animaciones, efectos y HUD

**Qué hace:**
- **Avatares:** `LpcAvatar` reproduce cualquier animación con su geometría. Hay un sprite para las criaturas, y los monstruos humanoides usan `LpcAvatar`.
- **Efectos:** `src/client/render/effects.ts` con proyectiles, áreas, avisos en el suelo y números flotantes.
- **HUD:** `src/client/hud/hud.ts` en DOM, con barras y casillas, barrido de recarga y atenuación sin recurso, aviso de derribo y "Mantén E para levantar".
- **Entradas:** clic izquierdo, clic derecho, 1–4, Espacio y E.

**Tests:** `icons.ts` (genera un icono por habilidad), lógica de presentación de recargas (`cooldownView`), formato de números flotantes.

**Verificación en la vista previa:** combate de cada clase, en grupo con dos pestañas.

### Task 8: E2E, documentación, revisión y publicación

**Tests E2E:**
- `kill a skeleton with basic attacks`.
- `cleric heals a damaged ally`.
- `downed player revived with E`.
- `hotbar shows cooldown after use`.
- Los E2E existentes siguen en verde.

**Cierre:** README (controles), GDD (estados y registro de cambios), revisión final y publicación (ya autorizada al terminar cada plan).
