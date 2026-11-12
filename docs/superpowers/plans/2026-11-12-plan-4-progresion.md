# Plan 4 — Progresión: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (elegido: nativo). Pasos con checkbox.

**Goal:** Experiencia y niveles del 1 al 30, atributos, árbol de talentos, desbloqueos por nivel y especializaciones con sus mecánicas. El host es la autoridad y el progreso se guarda en el personaje.

**Spec:** `docs/superpowers/specs/2026-11-12-plan-4-progresion-design.md`, y `docs/GDD.md` (§4, anexos A y C).

## Global Constraints

- **Valores fijados por la spec:**
  - Curva `round(100 × L^1,6)` y nivel máximo 30.
  - Experiencia por monstruo `round(8 × nivel^1,2)`, ×4 si es élite.
  - Factor de diferencia de nivel `max(0,1; 1 − 0,15 × (d − 2))` cuando `d > 2`.
  - Reparto a ≤ 800 px con bonus `1 + 0,1 × (n − 1)`.
  - 5 puntos de atributo por nivel, 1 punto de talento por nivel desde el 2.
  - Bloqueo de 0,2 % por punto de Fuerza, que reduce el daño un 50 %.
  - Reducción de recargas con tope del 40 %.
- **Formato del guardado:** versión 2, con migración desde la 1.
- **Textos:** todos en `data/i18n/es.json`.
- **Versión del juego:** 0.4.0.
- **Git:** rama `plan-4-progresion`; commits en inglés con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Un cliente modificado envía atributos o talentos imposibles.** El host los reinicia y el jugador sigue jugando (Task 2, `invalid progression is reset on join`).
2. **Experiencia de un monstruo matado por alguien que se acaba de ir.** No debe fallar (Task 1, `xp ignores players who left`).
3. **Cambiar de especialización en combate.** Debe rechazarse (Task 4, `spec change refused in combat`).
4. **Un personaje antiguo (v1) que se importa o se carga.** Se migra a v2 sin perder nivel ni experiencia (Task 1, `migrates v1 to v2`).
5. **Un muerto que "sale" del sigilo, o un sigilo que no se rompe al recibir daño.** Ninguno de los dos debe pasar (Task 4, `stealth breaks on damage and attack`).

---

### Task 1: Experiencia, niveles, atributos y guardado v2
- `data/balance.json` (`xp`), `data/classes.json` (`growth`), `data/monsters.json` (`level`).
- `src/sim/progression/xp.ts`: `xpToNext(level)`, `monsterXp(def)`, `levelFactor(playerLevel, monsterLevel)`, `shareXp(world, monster)`.
- `Unit` gana `level`, `xp`, `attrs` y `freeAttrPoints`. `playerBaseStats` usa nivel, crecimiento y atributos.
- `src/save/character.ts`: v2 con `attributes`, `talents`, `specId` y `hotbar`, y la migración.
- **Tests:** curva, factor, reparto, subida de nivel (vida llena, evento), `xp ignores players who left`, `migrates v1 to v2`.

### Task 2: Talentos, validación y desbloqueos
- `data/talents.json`.
- `src/sim/progression/talents.ts`: `validateTalents(alloc, level)`, `talentMods(alloc)` y `canSpend(alloc, nodeId, level)`.
- `src/sim/progression/unlocks.ts`: `unlockedAbilities(classId, specId, level)`, `activePassives(...)` y `defaultHotbar`.
- El host valida el progreso en `hello`.
- **Tests:** requisitos de ruta y de puente, rango máximo, puntos disponibles, desbloqueos por nivel, `invalid progression is reset on join`.

### Task 3: Mecánicas nuevas del motor
- **Estadísticas nuevas:** `critDamage`, `cooldownReduction`, `lifesteal`, `blockChance` y `threatMultiplier`.
- **Condiciones** sobre el efecto de daño: `bonusVsStatus`, `fromBehindPct`, `farPct`, `executeBelowPct`.
- **Disparadores** de pasivas: `onCrit`, `onKill`, `onDodge`, `onLowHp`, `cheatDeath`, `everyNthBasic`.
- **Formas nuevas:** proyectil con `explodeRadius`, `pierce` y `count`/`spreadDeg`; `zone`; `revive`; `channelMs`.
- **Asesino:** combo, sigilo y veneno acumulable. **Tanque:** reflejo (`reflect`) y provocar en área.
- **Tests:** uno por mecánica, más `stealth breaks on damage and attack`.

### Task 4: Especializaciones
- `data/specs.json`, y las habilidades y pasivas del anexo A en los JSON de habilidades.
- El host procesa las peticiones `spec`, `attr`, `talent`, `reset*` y `hotbar`, y envía `progress`.
- **Tests:** que estén todas las del anexo A, `spec change refused in combat`, y que el Asesino sustituya el clic izquierdo.

### Task 5: Cliente
- `ClientSession` gestiona `progress` y las peticiones.
- `AutoSaver.saveProgress`.
- Ventanas de Personaje (C), Talentos (N) y Especialización.
- HUD: barra de experiencia, nivel y combo; efecto de subida de nivel.
- Verificación en la vista previa.

### Task 6: E2E, documentación, revisión y publicación
- E2E de subida de nivel y atributos persistentes, de talentos y reinicio, y de especialización con su habilidad.
- GDD v1.0, versión 0.4.0, revisión final, fusionar y publicar.
