# Plan 4 — Progresión: diseño

> Acordado en el chat el 2026-11-12. Amplía el GDD (§2.3, §4.3–4.7, anexos A y C). Si algo choca con el GDD, este documento concreta lo que se implementa en este plan.

## Objetivo

Que cada personaje progrese del nivel 1 al 30:
- Gana experiencia matando monstruos, solo o en grupo.
- Reparte atributos y talentos.
- Desbloquea habilidades por nivel.
- Al nivel 10 elige una de las dos especializaciones de su clase, con sus mecánicas propias.

El host es la autoridad y el progreso se guarda en el PC de cada jugador.

**Fuera de alcance:**
- Oro, coste de reinicio y capital. Hasta que existan, reiniciar talentos y cambiar de especialización es **gratis, en cualquier momento, fuera de combate**.
- Experiencia de misiones (Plan 6).
- Marcos de grupo y minimapa (Plan 7).

## 1. Experiencia y niveles

- **Curva:** `xpParaSubir(L) = round(100 × L^1,6)`, con L de 1 a 29. Nivel máximo 30.
- **Nivel de los monstruos** (campo `level` en `data/monsters.json`):

| Monstruo | Nivel |
|---|---|
| Murciélago | 1 |
| Esqueleto | 2 |
| Chamán | 3 |
| Orco élite | 5 |

- **Experiencia por muerte:** `round(8 × nivel^1,2) × (4 si es élite)`.
- **Diferencia de nivel:** con `d = nivel del jugador − nivel del monstruo`, el factor es 1 si `d ≤ 2`, y si no `max(0,1; 1 − 0,15 × (d − 2))`.
- **Reparto:** entre los jugadores no muertos a ≤ 800 px del monstruo. Cada uno recibe `total × (1 + 0,1 × (n − 1)) / n`, redondeado.
- **Subida de nivel:**
  - Vida y recurso al máximo.
  - Se ganan 5 puntos de atributo y 1 punto de talento (desde el nivel 2).
  - Evento `levelup` con efecto dorado y mensaje de chat para todos: `"{name} ha alcanzado el nivel {level}"`.
  - En el nivel 30, la experiencia deja de acumularse.
- **Muerte:** no hace perder experiencia.

## 2. Atributos

- **Crecimiento automático por nivel** (en `data/classes.json`, `growth`):
  - Guerrero: Fuerza +1 y Aguante +1.
  - Clérigo: Intelecto +1 y Espíritu +1.
  - Mago: Intelecto +1 y Aguante +1.
  - Explorador: Agilidad +1 y Aguante +1.
- **Puntos libres:** `5 × (nivel − 1)`, repartidos por el jugador. Los no gastados se conservan.
- **Bloqueo:** la Fuerza aporta probabilidad de bloqueo (0,2 % por punto). Un bloqueo reduce un 50 % el daño físico de un golpe cuerpo a cuerpo.
- **Estadísticas nuevas:**
  - `critDamage`: se suma al ×1,5 del crítico.
  - `cooldownReduction`: tope del 40 %.
  - `lifesteal`: porcentaje del daño hecho que cura al atacante.
  - `blockChance`.
  - `threatMultiplier`: multiplicador de la amenaza generada.

## 3. Árbol de talentos (anexo C del GDD)

- **Estructura:** 5 rutas (Poderío, Arcano, Bastión, Celeridad y Vitalidad).
  - Nivel 1: 2 nodos de 3 rangos.
  - Nivel 2: 2 nodos de 3 rangos; requiere 3 puntos en la ruta.
  - Nivel 3: 1 nodo de 3 rangos; requiere 6.
  - Nivel 4: 1 nodo culminante de 1 rango; requiere 9.
- **Puentes:** 5, entre rutas vecinas (orden circular Poderío – Celeridad – Vitalidad – Bastión – Arcano – Poderío). Tienen 2 rangos y requieren 3 puntos en cada una de las dos rutas.
- **Puntos:** `nivel − 1`, es decir, 29 al nivel 30.
- **Validación:** un árbol válido cumple los requisitos según cualquier orden de compra posible: los requisitos se comprueban contra el total de puntos de la ruta. Los puntos de un puente no cuentan para las rutas.
- **Datos:** `data/talents.json`.

## 4. Desbloqueos por nivel

- **Habilidades base:** clic izquierdo, clic derecho y ranura 1 desde el nivel 1; la habilidad 2 al nivel 3 y la 3 al nivel 6.
- **Pasivas de clase:** niveles 5 y 15.
- **Especialización:** se elige desde el nivel 10.
  - Activas de especialización: niveles 10, 16 y 22.
  - Pasivas de especialización: niveles 10, 20 y 30.
- **Barra:**
  - Las ranuras 1–4 se asignan desde la ventana de Personaje entre las activas desbloqueadas.
  - Por defecto: las base en 1–3 y la primera de la especialización en 4.
  - La asignación se guarda en el personaje.
- **Asesino:** sustituye el clic izquierdo por *Cuchillada*.

## 5. Especializaciones y mecánicas nuevas

- **Contenido:** las del anexo A (24 activas y 24 pasivas) en `data/abilities/*.json` y `data/specs.json`.
- **Mecánicas genéricas en datos:**
  - **Condiciones de daño:**
    - `bonusVsStatus`: arde (dot de fuego), ralentizado o congelado.
    - `fromBehindPct`.
    - `farPct` (a más de 250 px).
    - `executeBelowPct` (por debajo del 25 %).
  - **Disparadores de pasivas:** `onCrit`, `onKill`, `onDodge`, `onLowHp` (por debajo del 20 %, con recarga), `cheatDeath` (golpe mortal: queda a 1 de vida o renace con un %, con recarga), `everyNthBasic`.
  - **Formas nuevas:**
    - Proyectil con `explodeRadius`, `pierce` y `count` más `spreadDeg`.
    - Zona persistente (`zone`: radio, duración y efectos por tick).
    - `revive` a distancia.
    - `channelMs`: el lanzador queda inmóvil y la habilidad se resuelve al terminar o por ticks.
  - **Asesino:**
    - Puntos de combo (0–5; la Cuchillada da 1 y la Evasión mortal 2 tras esquivar).
    - *Eviscerar* consume los puntos y escala el daño por punto.
    - Sigilo: los monstruos no lo detectan; se rompe al atacar o recibir daño, y el primer golpe saliendo de sigilo es crítico seguro con un +50 %.
    - Veneno acumulable hasta 5.
  - **Tanque:**
    - *Provocar* en área.
    - *Represalia* devuelve un % del daño recibido.
    - *Postura defensiva*: amenaza ×2 y +15 % de vida.
- **Valores:** propuesta inicial en los datos, ajustable tras las pruebas.

## 6. Guardado y red

- **Personaje, formato versión 2:** añade `attributes` (puntos repartidos), `talents` (rango por nodo), `specId` (o null) y `hotbar` (4 ranuras). La migración v1→v2 pone todo vacío o por defecto.
- **`hello`:** envía el progreso. El host lo valida y, si no es coherente con el nivel, reinicia atributos, talentos o especialización, sin rechazar al jugador.
- **Peticiones del cliente** (mensaje `progress-req`):
  - `attr` (atributo, +1).
  - `talent` (nodo, +1).
  - `spec` (id).
  - `resetTalents`, `resetAttrs`.
  - `hotbar` (ranura, habilidad).

  El host comprueba nivel, puntos disponibles, requisitos y que el jugador esté fuera de combate cuando aplica.
- **Mensaje fiable `progress`** del host al jugador, con `level`, `xp`, `xpToNext`, atributos, talentos, especialización, barra, puntos libres y estadísticas resumidas. Se envía al unirse y cada vez que cambia. El cliente lo aplica a su personaje y lo guarda (`AutoSaver.saveProgress`).
- **Desarrollo:** `/dev xp <n>` y `/dev level <n>`.

## 7. Interfaz

- **Personaje (C):** atributos con "+", estadísticas, especialización (elegir o cambiar), y habilidades desbloqueadas para asignar a la barra (clic en la habilidad y luego en la ranura).
- **Talentos (N):** 5 columnas de rutas con nodos cuadrados (rango n/m), puentes entre columnas, clic para invertir, botón Reiniciar y descripción al pasar el ratón.
- **Ventana de especialización:** se abre sola al llegar al nivel 10 si aún no hay ninguna.
- **HUD:** barra de experiencia y nivel. Con la especialización Asesino, los puntos de combo aparecen sobre la barra de recurso.

## 8. Pruebas

- **Unitarias:**
  - Curva y reparto de experiencia, factor de nivel.
  - Validación de atributos y talentos.
  - Requisitos del árbol.
  - Desbloqueos.
  - Migración v1→v2.
  - Cada mecánica nueva.
  - Que existan todas las habilidades y pasivas del anexo A.
  - Validación de datos.
- **E2E:**
  - Subir de nivel con `/dev`, repartir puntos y comprobar que persisten al recargar.
  - Talentos y reinicio.
  - Elegir especialización al nivel 10 y usar su habilidad.
