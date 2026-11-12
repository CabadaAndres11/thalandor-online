# Plan 5 — Objetos, botín y economía: diseño

> Acordado en el chat el 2026-11-12. Amplía el GDD §8. Si algo choca con el GDD, este documento concreta lo que se implementa en este plan.

## Objetivo
Que los monstruos suelten oro, objetos y pociones, y que el jugador:
- Los recoja.
- Los guarde en el inventario.
- Se equipe (con cambio de aspecto visible).
- Compre, venda y repare con un mercader provisional.

El host es la autoridad y todo se guarda en el personaje.

**Fuera de alcance:**
- Comercio entre jugadores (más adelante).
- Alijo y capital (Plan 6).
- Objetos únicos de jefe: el formato los admite, pero aún no hay jefes.

## 1. Objetos y estadísticas
- **Objeto base** (`data/items/bases.json`):
  - Ranura, tipo (armadura: tela, cuero, malla o placas; arma: espada, hacha, maza, bastón, varita, arco o daga; mano secundaria: escudo, orbe o carcaj).
  - Aspecto (pieza LPC y color).
  - Estadísticas base por nivel (armadura, poder, atributos).
  - Rango de niveles en el que puede caer.
- **Ranuras (11):** arma principal, mano secundaria, cabeza, hombros, pecho, manos, piernas, pies, cuello y 2 anillos.
- **Tipos de armadura por clase:**
  - Tela: Mago y Clérigo.
  - Cuero y malla: Explorador.
  - Malla y placas: Guerrero.
  - Cada clase lleva su tipo y los inferiores (tela < cuero < malla < placas).
- **Armas por clase:**
  - Guerrero: espada, hacha, maza y escudo.
  - Clérigo: maza, bastón y escudo.
  - Mago: bastón y orbe (las varitas LPC no tienen animación de lanzar, se dejan para más adelante).
  - Explorador: arco, daga y carcaj.
  - Las armas dan poder de ataque o de hechizos; no hay rango de daño.
- **Nivel del objeto:** el del monstruo que lo suelta. Las estadísticas base escalan con él.
- **Rarezas:**

  | Rareza | Propiedades aleatorias | Color |
  |---|---|---|
  | Común | 0 | blanco |
  | Poco común | 1 | verde |
  | Raro | 2 | azul |
  | Épico | 3 | morado |

- **Propiedades aleatorias** (`data/items/affixes.json`):
  - Planas o porcentuales, escaladas por nivel.
  - Sin repetir estadística en un mismo objeto.
  - Se suman a la fórmula existente `(base + planos) × (1 + %)`.
- **Requisito de nivel:** no se puede equipar un objeto de nivel superior al del personaje.
- **Aspecto:**
  - Lo da el objeto base. Cada uno tiene su pieza LPC y su color (paletas de metal y tela).
  - Son visibles el arma, la mano secundaria, la cabeza, los hombros, el pecho, las manos, las piernas y los pies.
  - Sin una pieza equipada se ve la ropa por defecto de la clase en esa ranura.
  - El host comparte el aspecto equipado en el roster.

## 2. Botín y recogida
- **Botín personal:** los jugadores no muertos a ≤ 800 px del monstruo tiran por separado, como con la experiencia.
- **Oro:** casi siempre, `round(2 × nivel^1,3 × (0,8–1,2))`. El élite da ×4.
- **Objetos:**
  - Monstruo normal: 12 % de probabilidad.
  - Élite: 1 seguro y 40 % de un segundo.
- **Rareza:**
  - Normal: común 55 %, poco común 30 %, raro 12 %, épico 3 %.
  - Élite: común 25 %, poco común 45 %, raro 22 %, épico 8 %.
- **Pociones:** 6 % de probabilidad (vida o recurso, al 50 %).
- **Utilidad:** el 75 % de los objetos es usable por la clase del jugador.
- **En el suelo:**
  - Cada objeto cae suelto cerca del cadáver, con brillo y nombre del color de su rareza.
  - Al pasar el ratón se ven sus estadísticas.
  - Solo lo ve su dueño.
  - Se recoge pasando por encima (a ≤ 24 px). Si el inventario está lleno, se queda en el suelo con un aviso.
  - Desaparece a los 2 minutos o cuando su dueño sale.
  - El oro va al dueño al pasar por encima.
- **Validación:** el host decide el botín y valida cada recogida (dueño y distancia).
- **Desarrollo:** `/dev item <rareza> [ranura]` y `/dev gold <n>`.

## 3. Inventario, equipo y economía
- **Inventario:** 30 casillas (ventana I).
  - Clic derecho: equipar o usar. Si el mercader está abierto, vender.
  - No se puede vender ni tirar fuera del mercader.
  - El tooltip compara con lo equipado (verde si mejora, rojo si empeora) y muestra «Requiere nivel X» en rojo.
- **Equipo:** la ventana C muestra las 11 ranuras. Clic derecho en una ranura para quitarse la pieza; necesita hueco en el inventario.
- **Oro:** se guarda con el personaje y se muestra en el inventario.
- **Mercader provisional** en el mapa de prueba:
  - Un PNJ con nombre, que se abre con E a ≤ 64 px.
  - Vende pociones y algunos objetos comunes de la clase del jugador, de su nivel.
  - Compra cualquier objeto por el 25 % de su valor.
  - Repara todo el equipo (coste proporcional al valor y al desgaste).
  - Se moverá a la capital en el Plan 6.
- **Valor de un objeto:** `round(3 × nivel^1,4 × multiplicador de rareza)`, con multiplicadores 1 / 2 / 4 / 8.
- **Durabilidad:**
  - De 0 a 100 en cada pieza equipada. Baja 10 al morir (no al quedar derribado).
  - A 0, la pieza no da estadísticas y su icono se ve en rojo.
- **Pociones:**
  - Q usa la de vida (35 % de la vida máxima) y R la de recurso (35 % del recurso máximo; la ira no tiene).
  - Comparten 30 s de recarga.
  - Se acumulan hasta 20 por casilla.
  - El HUD muestra las casillas Q y R con su cantidad.

## 4. Guardado y red
- **Personaje v3:** añade `gold`, `inventory` (30 casillas: objeto o null), `equipment` (11 ranuras) y la durabilidad dentro de cada objeto.
  - La migración v2 → v3 deja el inventario vacío y 0 de oro.
- **Objeto guardado:** `{ uid, baseId, level, rarity, affixes: [{ id, value }], durability }`, o `{ uid, potion, count }` para las pociones.
  - El host recalcula siempre las estadísticas desde los datos: nunca confía en valores del cliente.
- **Hola:** el cliente envía inventario, equipo y oro.
  - El host valida cada objeto: base y afijos existentes, valores dentro de su rango, nivel de 1 a 30, una sola vez cada uid.
  - Lo inválido se descarta y lo equipado imposible se mueve al inventario.
- **Peticiones** (dentro de `progress-req`): `equip`, `unequip`, `use` (poción), `buy`, `sell`, `repair` y `merchant` (abrir o cerrar).
- **Mensaje `inventory`** (fiable) del host al jugador, con oro, inventario y equipo. El cliente lo guarda (`AutoSaver.saveInventory`).
- **Eventos:** `loot` (objetos en el suelo, solo al dueño), `lootGone` y `pickup`.

## 5. Interfaz
- **Inventario (I):** cuadrícula de 6×5 con iconos (glifo por tipo y color de rareza), cantidades, oro y tooltips.
- **Personaje (C):** columna de equipo con 11 ranuras y durabilidad.
- **Mercader:** ventana con lo que vende (clic para comprar), botón «Reparar todo (X oro)», y venta con clic derecho en el inventario mientras está abierta.
- **HUD:** casillas Q y R junto a la barra, con cantidad y recarga.
- **Suelo:** objetos con brillo del color de su rareza y nombre al pasar el ratón; montón de oro.

## 6. Pruebas
- **Unitarias:**
  - Tiradas (rareza, afijos sin repetir, rangos).
  - Validación de objetos.
  - Equipar (clase, nivel, ranuras, anillos).
  - Estadísticas con equipo y con durabilidad 0.
  - Recogida (dueño, distancia, inventario lleno).
  - Mercader (precios, oro insuficiente, reparación).
  - Pociones (recarga y cantidad).
  - Migración v2 → v3.
  - Datos (todos los aspectos existen en el catálogo).
- **E2E:**
  - Matar, recoger, equipar y ver el cambio de aspecto.
  - Comprar, vender y reparar con el mercader.
  - Pociones.
  - Persistencia al recargar.
