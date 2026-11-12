# Plan 3 — Combate y clases: diseño

> Acordado en el chat el 2026-11-12. Amplía el GDD (§4.1–4.3, §4.6, §5, §9.2 y anexo A). Si algo choca con el GDD, este documento concreta lo que se implementa en este plan.

## Objetivo

Combate de acción en tiempo real, solo o en grupo, con las 4 clases usando todo su kit base y contra 4 tipos de monstruos con IA, amenaza, derribo y reaparición. Incluye una interfaz de combate con barras y una barra de habilidades en casillas con iconos.

**Fuera de alcance:**
- Especializaciones, experiencia, niveles y talentos (Plan 4).
- Botín, equipo y desgaste (Plan 5).
- Zonas, misiones y jefes (Plan 6).
- Marcos de grupo, minimapa y reasignación de teclas (Plan 7).

---

## 1. Estadísticas, daño, recursos, amenaza y muerte

**Estadísticas:**
- **Fórmula:** `final = (base + suma de bonos planos) × (1 + suma de bonos %)`. Las listas de bonos de equipo y talentos existen, pero están vacías en este plan.
- **Atributos:** los de nivel 1 de cada clase (Fuerza, Agilidad, Intelecto, Aguante y Espíritu) están en `data/classes.json`.
- **Conversión:** los atributos se convierten en vida máxima, poder de ataque, poder de hechizos, % de crítico, % de esquiva, maná máximo y regeneración, con constantes en `data/balance.json`.

**Daño:**
- **Fórmula:** `daño = base + coef × poder`, donde el poder es el de ataque o el de hechizos según la escuela de la habilidad, con una variación de ±10 %.
- **Armadura** (solo daño físico): reduce `armadura / (armadura + 100)`, con un máximo del 75 %.
- **Crítico:** ×1,5 más los bonos de daño crítico.
- **Esquiva:** evita el golpe por completo; solo se aplica a habilidades marcadas como esquivables.
- **Sin fuego amigo.** La curación nunca supera la vida máxima, y los escudos absorben daño antes que la vida.

**Recursos:**

| Recurso | Máximo | Comportamiento |
|---|---|---|
| Ira | 100 | +ira al golpear (según la habilidad) y al recibir daño (proporcional); fuera de combate decae 5/s tras 3 s |
| Maná | Según Intelecto | Regenera según Espíritu; en combate un 0 %, o un 50 % con *Meditación* |
| Energía | 100 | +10/s |

- **Vida:** fuera de combate se regenera un 2 % por segundo.
- **Fin del combate:** 5 s sin dar ni recibir daño.

**Amenaza:**
- **Generación:** el daño genera amenaza 1:1 en el monstruo golpeado. La curación genera un 50 %, repartido entre los monstruos que tienen al sanador en su tabla de amenaza.
- **Objetivo:** el monstruo persigue al primero de su tabla.
- **Sin objetivo** (muerto, derribado o perdido): el monstruo pasa al siguiente. Si no queda ninguno, retorna.

**Escalado:** la vida máxima de un monstruo es `base × (1 + 0,75 × (jugadores en la zona − 1))`, recalculada al aparecer y cuando cambia el número de jugadores, conservando el porcentaje de vida.

**Muerte del jugador:**
- **Derribado:** si queda al menos otro jugador vivo en la zona, el jugador cae derribado durante 30 s, sin poder moverse ni actuar.
- **Levantar:** un aliado vivo a 48 px o menos que mantenga **E** 3 s seguidos lo levanta con un 30 % de vida. La canalización se interrumpe si el aliado se mueve o recibe daño.
- **Reaparición:** con los 30 s agotados, si todos caen o en solitario, el jugador reaparece en el punto de aparición a los 3 s, con la vida y el recurso llenos.
- **Monstruos:** al quedarse sin objetivos, pierden la amenaza sobre él.

## 2. Motor de habilidades

- **Datos:** `data/abilities/<clase>.json` y `data/abilities/monsters.json`.
- **Campos de cada habilidad:**
  - `id`, `nameKey`, `icon`, `school` (`physical`, `holy`, `fire`, `frost`, `arcane` o `nature`), `cost`, `cooldownMs`, `gcd`, `range`, `anim` (`slash`, `thrust`, `spellcast`, `shoot` o `none`), `dodgeable`.
  - `shape`:
    - `melee_arc` (con `radius` y `arcDeg`)
    - `projectile` (con `speed`, `radius`, `pierce`)
    - `area_target` (con `radius`, `delayMs`)
    - `area_self` (con `radius`)
    - `ally_target`
    - `self`
    - `dash` (con `distance`, `stopOnHit`)
    - `blink` (con `distance`)
  - `effects[]`, aplicados a cada objetivo alcanzado:
    - `damage` (con `base`, `coef`)
    - `heal` (con `base`, `coef`, `target`: `self`, `allies` o `ally`)
    - `shield` (con `amount`, `durationMs`)
    - `buff` y `debuff` (con `stat`, `pct`, `durationMs`, `scope`: `self` o `party`)
    - `dot` y `hot` (con `base`, `coef`, `tickMs`, `durationMs`)
    - `stun`, `root`, `freeze`, `slow` (con `pct`) y `taunt`, todos con `durationMs`
    - `resource` (con `amount`, donde un valor negativo gasta)
- **Ranuras:** clic izquierdo, clic derecho y las ranuras 1–4. En este plan, las 3 habilidades base de cada clase ocupan las ranuras 1–3 y la 4 queda vacía.
- **Recargas:**
  - Recarga global de 500 ms, salvo en las habilidades con `gcd: false`. Los ataques básicos llevan `gcd: false` y su propia recarga.
  - Esquiva común a todas las clases: 96 px en 150 ms en la dirección del movimiento (o del apuntado si estás quieto), 300 ms de invulnerabilidad y 3 s de recarga. Es predicha en el cliente.
- **Ejecución:**
  - El host valida la habilidad (vivo y no aturdido, coste, recarga y alcance) y la ejecuta.
  - Los proyectiles y las áreas con retardo son entidades del host.
  - *Carga* y la esquiva desplazan con la colisión normal. *Parpadeo* busca el último punto libre en la línea hacia el cursor.
- **Kits:** los del anexo A (habilidades base de los niveles 1–6 y pasivas de clase de los niveles 5 y 15), todos disponibles en este plan. Los valores son una propuesta inicial que se ajustará en las pruebas.

## 3. Monstruos

- **Datos:** `data/monsters/*.json`. Cada monstruo define:
  - `id`, `nameKey`.
  - `look`: capas LPC (humanoide) o `creature` (hoja, tamaño de fotograma y filas).
  - `stats` (vida, armadura, poder y velocidad), `radius`, `aggroRange`, `leashRange`.
  - `abilities[]` y `behavior` (`melee`, `ranged` con `keepDistance`, o `pack`).
  - `elite`.
- **IA del host:** `idle` (deambula 64 px alrededor del punto de aparición) → `alert`/`combat` → `return`.
  - **Detección:** un jugador vivo dentro del rango de aggro y con línea de visión, sin tiles sólidos en medio.
  - **Persecución:** usa una ruta A* sobre la cuadrícula de colisión, recalculada cada 500 ms. Los de tipo `ranged` mantienen la distancia y retroceden si se les acerca alguien.
  - **Retorno:** si se alejan más de `leashRange` de su punto de aparición o no tienen objetivo, vuelven, recuperan la vida y vacían su tabla de amenaza.
  - **Manada:** al recibir daño, los `pack` avisan a los aliados en 160 px.
- **Tipos de prueba:**
  - **Esqueleto guerrero:** cuerpo a cuerpo.
  - **Chamán goblin:** a distancia, con proyectil.
  - **Murciélago:** rápido y débil, va en manadas de 3.
  - **Orco élite:** golpe en área de 1,2 s con aviso en el suelo.
- **Aparición:** se colocan como objetos de Tiled (capa `spawns`, con `monster`, `count` y `respawnMs`). Un monstruo reaparece al terminar `respawnMs` tras su muerte. No hay puntos de aparición a menos de 8 tiles del punto de aparición de los jugadores.

## 4. Red, cliente e interfaz

**Entradas:**
- Añaden `buttons`, un mapa de bits: CI, CD, 1, 2, 3, 4, Espacio y E (mantenida).
- Añaden `presses`, la lista de pulsaciones aún no confirmadas, cada una con su `seq`, que se reenvía en cada entrada hasta que el host la confirma.
- El host ejecuta cada pulsación una sola vez.

**Instantánea:**
- `units[]`, con jugadores y monstruos: `id`, `kind` (`player` o `monster`), `typeId` (monstruo), `x`, `y`, `facing`, `moving`, `hp`, `maxHp`, `state` (`alive`, `downed` o `dead`) y `action` (animación y tiempo de inicio).
- **Solo viajan las unidades a menos de 800 px** del jugador destinatario.
- Bloque privado `me`: recurso, máximo, recargas por ranura, recarga global, escudo, estados activos y tiempo de derribo.

**Eventos fiables `events[]`:**
- `hit`, con origen, destino, cantidad, crítico, esquiva, tipo (daño o cura) y escuela.
- `projectile`, con su creación (posición, velocidad y aspecto) y su fin.
- `telegraph`, con forma, posición y tiempo.
- `cast`, `downed`, `revived`, `died` y `respawned`.

**Cliente:**
- **Predicción:** predice el movimiento y la esquiva.
- **Animaciones:** reproduce al instante la animación de su propio ataque y las de los demás a partir de `action`.
- **Efectos:** números flotantes (daño blanco, crítico amarillo y más grande, curación verde, "Esquivado"), proyectiles y áreas con formas de Phaser, y avisos en el suelo que se rellenan.
- **Arte nuevo:** animaciones LPC de tajo, estocada, hechizo, disparo y daño para los jugadores y los humanoides (hojas grandes cuando las haya), y animaciones del pack para las criaturas.

**HUD:**
- **Abajo en el centro:** barras de vida y recurso, y la **barra de habilidades en casillas cuadradas con icono**:
  - Los iconos son provisionales: generados por código con color de escuela, símbolo y borde de clase.
  - Cada casilla muestra la tecla, el barrido de recarga con los segundos restantes, y se atenúa sin recurso suficiente.
  - El campo `icon` permite sustituir los iconos por arte definitivo.
- **Sobre cada unidad:** barras de vida.
- **Derribo:** un aviso con la cuenta atrás, y el texto "Mantén E para levantar" junto al compañero caído.

## 5. Pruebas

- **Unitarias:**
  - Estadísticas y fórmula de daño (armadura, crítico y esquiva, con semilla fija).
  - Recursos, recargas y recarga global.
  - Cada forma y cada efecto, y la amenaza.
  - Estados de la IA, A* y escalado.
  - Derribo, levantar y reaparición.
  - Validación de todos los JSON (efectos conocidos, iconos y textos existentes).
- **Red:**
  - Las pulsaciones sobreviven a un 10 % de pérdida.
  - Los eventos llegan a todos los jugadores.
  - Filtrado por distancia.
  - La esquiva predicha coincide con la del host.
- **E2E:**
  - Matar a un esqueleto.
  - Curar a un compañero.
  - Derribo y levantar con E.
  - La recarga se ve en la barra.
- **Manual (usuario):** la sensación de cada clase, la dificultad y una partida en grupo.
