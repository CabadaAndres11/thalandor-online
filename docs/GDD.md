# Thalandor Online — Game Design Document (GDD)

> Documento vivo. Se actualiza cada vez que una decisión cambia o una funcionalidad se implementa.
> Estado de cada apartado: **[Diseñado]** acordado pero sin implementar · **[En curso]** · **[Implementado]**.

| Campo | Valor |
|---|---|
| Versión del documento | 0.1 |
| Fecha | 2026-11-11 |
| Versión del juego | — (sin implementar) |

---

## 1. Visión

**Thalandor Online** es un RPG de acción 2D en pixel art, con vista cenital y combate en tiempo real, para jugar online con hasta 4 amigos.

Busca la sensación de un MMO clásico (personajes persistentes, clases con roles, misiones, mazmorras, botín) sin la masividad: cada jugador tiene su personaje y avanza solo o en grupo cuando coincide con sus amigos.

### 1.1 Pilares
1. **Tu personaje es tuyo.** El progreso vive en el personaje, no en la partida de otro jugador. Nadie depende de otro para jugar.
2. **Solo o en grupo, sin fricción.** Se puede jugar en solitario y abrir el grupo a amigos en cualquier momento.
3. **Roles que se complementan.** Tanque, sanador y daño tienen sentido en grupo, pero cada especialización puede sobrevivir sola.
4. **Construido para crecer.** El contenido (zonas, monstruos, objetos, misiones) se define como datos; añadir una zona no requiere tocar el motor.

### 1.2 Restricciones del proyecto
- **Presupuesto 0 €.** Toda herramienta, servicio, hosting y asset debe ser gratuito.
- **Plataforma:** PC con Windows, en navegador. Opcionalmente se empaquetará como aplicación de escritorio (Electron/Tauri) más adelante.
- **Jugadores:** de 1 a 4 por partida, cada uno en su casa, por internet.
- **Sin anti-trampas:** el juego es entre amigos; el host confía en los datos de los invitados.
- **Idioma:** español. Todos los textos están en archivos de datos, preparados para traducción.
- **Desarrollo:** construido íntegramente mediante prompts con Claude.

### 1.3 Alcance de la demo
- 4 clases jugables con kits activos y pasivos; las especializaciones están diseñadas y se implementan dentro de la demo (ver §4.3).
- Niveles 1–30, atributos repartibles y árbol de talentos.
- Capital y 3 zonas de nivel, cada una con su mazmorra y jefe.
- Multijugador online hasta 4 jugadores, guardado local y exportación de personajes.

**Fuera del alcance de la demo:** intercambio entre jugadores, soporte para mando, nodos de talento que modifiquen habilidades, chat de voz (se usa Discord).

---

## 2. Arquitectura técnica

### 2.1 Stack
| Pieza | Tecnología | Coste |
|---|---|---|
| Lenguaje | TypeScript | Gratis |
| Motor de render | Phaser 3 (WebGL) | Gratis (MIT) |
| Build | Vite | Gratis |
| Red | WebRTC mediante PeerJS (servidor de señalización público) y STUN públicos | Gratis |
| Mapas | Formato JSON de Tiled | Gratis |
| Guardado | IndexedDB, más exportación a archivo `.json` | Gratis |
| Tests | Vitest (lógica), Playwright (navegador) | Gratis |
| Hosting | GitHub Pages (repositorio público) | Gratis |

### 2.2 Modelo host-autoritativo
- **Siempre hay un host.** Al jugar solo, tu PC es el host y no hay invitados. En grupo, un jugador es el host y el resto se conecta a él. Hay un único camino de código para ambos casos.
- **Simulación.** El host ejecuta la simulación del mundo a **20 ticks/s** dentro de un **Web Worker**, para que no se ralentice si la pestaña pierde el foco.
- **Invitados.** Envían solo **entradas** (movimiento, dirección de apuntado, habilidad usada) y reciben **instantáneas del estado** del host.
- **Predicción en el cliente:** el personaje propio responde al instante y se reconcilia con el estado del host.
- **Interpolación:** el resto de entidades se dibujan suavizadas entre instantáneas.
- **El host también juega:** usa la misma interfaz de cliente, conectada a la simulación local por un transporte en memoria.

### 2.3 Propiedad de los datos
- **El personaje vive en el PC de su jugador:** nivel, atributos, talentos, equipo, inventario, oro, misiones y última ubicación.
- **Al unirse** a una partida, el invitado envía su personaje al host.
- **El host devuelve el personaje actualizado** periódicamente (cada 30 s), al cambiar de zona y al salir. El cliente lo guarda.
- **El estado del mundo es temporal:** monstruos vivos, objetos en el suelo y temporizadores de reaparición no se guardan.

### 2.4 Organización del código
| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `src/sim/` | Reglas del juego: entidades, movimiento, colisiones, combate, amenaza, IA, misiones, botín, progresión. TypeScript puro, sin gráficos, con tests. | `data/` |
| `src/net/` | Transporte detrás de una interfaz (`Transport`): implementación PeerJS/WebRTC, en memoria (local) y simulada (con latencia y pérdida, para tests). Serialización de mensajes. | — |
| `src/client/` | Render con Phaser, entradas, HUD y ventanas, audio, predicción e interpolación. | `sim/` (tipos), `net/` |
| `src/save/` | Persistencia en IndexedDB, exportación e importación, migraciones de versión del guardado. | `sim/` (tipos) |
| `data/` | Contenido: clases, habilidades, pasivas, talentos, monstruos, objetos, tablas de propiedades, misiones, zonas, textos. | — |
| `public/assets/` | Sprites, tilesets, audio. | — |

La interfaz `Transport` permite cambiar en el futuro a un servidor dedicado sin tocar `sim/` ni `client/`.

### 2.5 Conexión
1. El host pulsa **"Abrir grupo"** y obtiene un código corto.
2. Los invitados lo introducen en **"Unirse a un amigo"**.
3. PeerJS gestiona la señalización y la conexión WebRTC directa entre el host y cada invitado (topología en estrella).
4. Si la conexión directa falla, se reintenta con un relay TURN gratuito con límite de uso. El plan B documentado es una VPN gratuita tipo Tailscale.
5. **Control de versiones:** si el host y el invitado tienen versiones distintas, se rechaza la conexión con un aviso para recargar.

### 2.6 Rendimiento y escalabilidad del contenido
- **Carga por zona:** solo se cargan los assets de la zona actual, y los de la anterior se liberan.
- **Simulación multizona:** el host simula solo las zonas con al menos un jugador presente.
- **Memoria:** en el bucle de juego se reutilizan objetos (pools) para evitar tirones por la recolección de basura.

---

## 3. Controles

| Acción | Tecla |
|---|---|
| Moverse | W A S D |
| Apuntar | Ratón |
| Ataque básico | Clic izquierdo |
| Ataque secundario | Clic derecho |
| Habilidades | 1 · 2 · 3 · 4 |
| Esquiva / desplazamiento | Espacio |
| Chat de grupo | Enter |
| Ventanas | Personaje (C), Inventario (I), Talentos (N), Misiones (L), Mapa (M), Menú (Esc) |

Todas las teclas son reasignables desde Opciones.

---

## 4. Personajes y clases

### 4.1 Recursos
- **Vida:** todas las clases.
- **Recurso de clase:**
  - **Ira** (Guerrero): se genera golpeando y recibiendo daño, y decae fuera de combate.
  - **Maná** (Clérigo, Mago): se consume al lanzar y se regenera con Espíritu.
  - **Energía** (Explorador): se regenera rápido a ritmo fijo.

### 4.2 Clases y especializaciones
| Clase | Recurso | Especialización 1 | Especialización 2 |
|---|---|---|---|
| **Guerrero** | Ira | **Protección** (tanque) | **Armas** (daño cuerpo a cuerpo) |
| **Clérigo** | Maná | **Sanación** (sanador) | **Castigo** (daño sagrado a distancia) |
| **Mago** | Maná | **Fuego** (daño en área) | **Escarcha** (control y ralentización) |
| **Explorador** | Energía | **Tirador** (daño a distancia) | **Asesino** (daño cuerpo a cuerpo) |

**Supervivencia en solitario:**
- **Guerrero:** escudo y robo de vida.
- **Clérigo:** se cura a sí mismo.
- **Mago:** mantiene la distancia y congela.
- **Tirador:** esquiva y mantiene la distancia.
- **Asesino:** evasión alta y vuelta al sigilo para salir del combate.

**Mecánicas propias del Asesino:**
- **Sigilo:** invisibilidad fuera de combate; el primer golpe al salir de sigilo hace daño extra.
- **Venenos y sangrados:** daño en el tiempo.
- **Puntos de combo:** los ataques básicos acumulan puntos (máximo 5) que se gastan en remates.

### 4.3 Habilidades
- **Habilidades activas:**
  - Cada clase empieza con ~5: ataque básico, ataque secundario y 3 habilidades.
  - Desbloquea más al subir de nivel.
  - La barra tiene 4 ranuras asignables.
- **Habilidades pasivas:**
  - Se desbloquean automáticamente por nivel.
  - Hay **pasivas de clase**, comunes a ambas especializaciones (por ejemplo, Guerrero: "la ira decae más lento").
  - Y **pasivas de especialización** (por ejemplo, Asesino: "+20 % de daño por la espalda").
- **Especialización:** se elige al alcanzar el **nivel 10** y se puede cambiar en la capital.
  - Antes del nivel 10, el personaje usa el kit base de la clase.
  - Al elegir especialización se desbloquean sus habilidades activas y pasivas.
- **Definición:** el listado concreto de habilidades por clase se define en `data/abilities/` y se documentará aquí en el anexo A.

### 4.4 Atributos
Cada nivel otorga **5 puntos de atributo** para repartir libremente.

| Atributo | Efecto |
|---|---|
| **Fuerza** | Poder de ataque cuerpo a cuerpo, probabilidad de bloqueo |
| **Agilidad** | Probabilidad de crítico, esquiva, poder de ataque a distancia |
| **Intelecto** | Poder de hechizos, maná máximo |
| **Aguante** | Vida máxima |
| **Espíritu** | Regeneración de vida y maná |

Cada clase tiene atributos base propios por nivel, definidos en `data/classes/`.

### 4.5 Árbol de talentos
- **Puntos:** 1 por nivel a partir del 2, es decir, **29 puntos al nivel 30**.
- **Árbol común a todas las clases.** Los nodos solo dan estadísticas: no modifican habilidades.
- **Estructura:** un nodo central y **5 rutas**, cada una con unos 4 niveles de profundidad. Para desbloquear un nivel hay que haber gastado puntos en el nivel anterior de esa ruta.
- **Nodos multirrango:** se pueden invertir varios puntos en el mismo nodo.
- **Puentes entre rutas vecinas:** nodos que combinan estadísticas de dos rutas.
- **Reinicio:** el reinicio completo cuesta oro y se hace con el instructor de la capital.

| Ruta | Enfoque | Ejemplos de nodos |
|---|---|---|
| **Poderío** | Daño físico | +poder de ataque, +% crítico, +% daño crítico |
| **Arcano** | Daño mágico | +poder de hechizos, +maná, +% daño de hechizos |
| **Bastión** | Defensa | +armadura, +% vida, +% bloqueo |
| **Celeridad** | Velocidad | +% velocidad de ataque, +% movimiento, +% reducción de recarga, +% esquiva |
| **Vitalidad** | Sostenimiento | +regeneración, +% curación hecha y recibida, +% robo de vida |

Orden circular de las rutas, que determina los puentes: Poderío – Celeridad – Vitalidad – Bastión – Arcano – Poderío.

### 4.6 Cálculo de estadísticas
```
final = (base de clase + atributos repartidos + suma de bonos planos) × (1 + suma de bonos %)
```
- **Bonos planos:** equipo y talentos.
- **Bonos porcentuales:** equipo, talentos y pasivas.
- Los porcentajes de una misma estadística se **suman** entre sí antes de multiplicar; no se multiplican en cadena.
- **Datos:** todas las constantes y fórmulas de conversión (por ejemplo, Agilidad → % crítico) viven en `data/balance.json`.

### 4.7 Progresión
- **Nivel máximo de la demo:** 30.
- **Experiencia:**
  - Se gana con muertes de monstruos y con misiones.
  - En grupo, la experiencia de cada muerte se reparte entre los miembros cercanos, con un bonus por jugar en grupo.
- **Curva de experiencia:** definida en `data/balance.json`.

### 4.8 Creación de personaje
- Hasta **8 personajes** por jugador.
- Se eligen nombre, clase y apariencia (variaciones de paleta del sprite de la clase).

---

## 5. Combate

- **Tiempo real.** Ataques y proyectiles con hitbox, y esquiva con breve invulnerabilidad.
- **Amenaza (aggro):**
  - Cada monstruo mantiene una tabla de amenaza; el daño y la curación generan amenaza.
  - El monstruo ataca al jugador con más amenaza.
  - El tanque tiene habilidades de provocar y multiplicadores de amenaza.
- **Sin fuego amigo.**
- **Escalado por grupo:** la vida de los monstruos escala según el número de jugadores presentes en la zona o instancia.
- **Monstruos élite:** más fuertes, con mejor botín.
- **Jefes:** tienen fases y ataques en área que hay que esquivar.
- **Muerte:**
  - **En grupo:** el jugador queda **derribado** y un compañero puede levantarlo canalizando unos segundos.
  - **En solitario, o si cae todo el grupo:** reaparición en el último punto de control. Se pierde **durabilidad del equipo**, no experiencia.

---

## 6. Mundo

### 6.1 Estructura
- **Zonas:** el mundo está formado por zonas conectadas; cada una es un mapa de Tiled. Se pasa entre zonas por sus bordes, con una pantalla de carga breve.
- **Varias zonas a la vez:** dentro de una partida los jugadores pueden estar en zonas distintas.
- **Mazmorras:** son **instancias**, es decir, cada grupo tiene su propia copia.
- **Puntos de control:** cada zona tiene puntos de control para reaparecer.
- **Reaparición de monstruos:** con temporizador.

### 6.2 Contenido de la demo
| Zona | Niveles | Contenido |
|---|---|---|
| **Capital** | — | Zona segura: vendedores, instructor de talentos y especialización, reparador, alijo y personajes con misiones |
| **Zona 1** | 1–10 | Cadena de misiones y **Mazmorra 1** con jefe |
| **Zona 2** | 10–20 | Cadena de misiones y **Mazmorra 2** con jefe |
| **Zona 3** | 20–30 | Cadena de misiones y **Mazmorra 3** con jefe |

Los nombres, la ambientación, la historia y los monstruos de cada zona se definirán en el anexo B.

### 6.3 Pipeline de contenido
Añadir una zona consiste en aportar:
1. El mapa de Tiled.
2. Las entradas de monstruos y spawns.
3. Las misiones.
4. Los textos.

Todo ello en `data/`, sin modificar código. Este es un requisito de arquitectura, porque el juego está pensado para crecer a muchas zonas.

---

## 7. Misiones

- **Tipos:**
  - Matar X.
  - Recoger objetos que sueltan los monstruos.
  - Hablar con alguien o entregarle un objeto.
  - Explorar una ubicación.
  - Derrotar a un jefe.
- **Cadenas:** las misiones se encadenan mediante requisitos (misión previa completada, nivel mínimo).
- **Progreso:** es **por personaje**. En grupo, una muerte cuenta para todos los miembros cercanos que tengan la misión activa.
- **Recompensas:** experiencia, oro y, opcionalmente, un objeto a elegir entre varios.

---

## 8. Botín, objetos y economía

- **Botín personal:** cada jugador ve y recoge el suyo.
- **Rarezas:**

| Rareza | Estadísticas |
|---|---|
| Común | Fijas |
| Poco común | Fijas + 1 propiedad aleatoria |
| Raro | Fijas + 2 propiedades aleatorias |
| Épico | Fijas + 3 propiedades aleatorias |
| Único de jefe | Fijas, con nombre propio |

- **Propiedades aleatorias:**
  - Se sacan de tablas por nivel de objeto.
  - Pueden ser **planas** (+12 Fuerza) o **porcentuales** (+5 % daño crítico).
- **Ranuras de equipo:** arma principal, mano secundaria, cabeza, hombros, pecho, manos, piernas, pies, cuello, anillo ×2.
- **Inventario:** espacio limitado y alijo ampliado en la capital.
- **Oro:**
  - Se obtiene de monstruos, misiones y ventas.
  - Se gasta en reparaciones, reinicio de talentos, cambio de especialización y objetos de vendedor.
- **Durabilidad:** baja al morir y se repara en la capital.
- **Intercambio entre jugadores:** fuera de la demo.

---

## 9. Interfaz y flujo

### 9.1 Flujo
1. **Pantalla de título.**
2. **Selección de personaje:** opciones de crear, borrar, exportar e importar personajes.
3. **Jugar:** entra al mundo como host de su propia partida.
   - **"Abrir grupo"** está disponible en cualquier momento desde el menú y genera un código.
   - **"Unirse a un amigo":** se usa desde la selección de personaje, introduciendo el código.
   - **Al unirse**, el invitado aparece en su última ubicación guardada.
   - **"Ir con el grupo"** teletransporta junto al líder, solo fuera de combate.

### 9.2 HUD
- Vida, recurso de clase y barra de experiencia.
- Barra de habilidades con tiempos de recarga.
- Marcos de grupo con la vida y el recurso de los compañeros.
- Minimapa y seguimiento de misiones.
- Números de daño flotantes, y nombre y vida sobre los enemigos.

### 9.3 Ventanas
- Personaje (equipo y reparto de atributos), Inventario, Talentos, Diario de misiones y Mapa del mundo.
- Opciones: controles, volumen y pantalla completa.

### 9.4 Social
- Chat de texto de grupo.
- Para la voz se usa Discord, que es externo y gratuito.

---

## 10. Guardado

- **Autoguardado:** cada 30 s, al cambiar de zona y al salir.
- **Almacenamiento:** en **IndexedDB**.
- **Exportación e importación:** cada personaje se puede exportar e importar como archivo `.json`, como copia de seguridad o para jugar desde otro PC.
- **Versiones del guardado:** cada guardado lleva un número de versión de esquema y se migra automáticamente al actualizar el juego. Ninguna actualización puede borrar personajes.

---

## 11. Arte y audio

- **Estilo:** pixel art con un tamaño de tile único, por definir entre 16×16 y 32×32 según los packs elegidos.
- **Fuentes de assets:**
  - Solo packs gratuitos con licencia que permita uso y modificación (CC0, CC-BY o licencias equivalentes de itch.io), por ejemplo de Kenney, OpenGameArt o itch.io.
  - Antes de descargar, se proponen 2 o 3 packs candidatos de estilo coherente para su aprobación.
- **Créditos:** cada asset queda registrado con autor y licencia en `CREDITS.md`.
- **Gráficos provisionales:** se generan por código hasta tener los definitivos.
- **Audio:** música y efectos de sonido de packs gratuitos con licencia libre.

---

## 12. Pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitario | Vitest | Estadísticas, daño, amenaza, talentos, misiones, botín, experiencia, migraciones de guardado |
| Simulación de red | Vitest con transporte simulado | 1 host y 3 invitados con latencia y pérdida de paquetes; sincronización y reconciliación |
| Navegador (E2E) | Playwright | Crear personaje, abrir grupo y unir 4 pestañas, jugar, guardar y recargar |
| Real | Partidas con amigos | Conexión entre casas y diversión |

---

## 13. Distribución

- **Repositorio:** **público** en GitHub, desplegado automáticamente en **GitHub Pages**.
- **Versión visible:** cada versión del juego lleva su número en la pantalla de título.
- **Control de versiones en la conexión:** está descrito en §2.5.
- **Escritorio (opcional, futuro):** empaquetado con Electron o Tauri.

---

## Anexos (pendientes de definir)
- **A. Habilidades activas y pasivas por clase y especialización.**
- **B. Zonas:** nombres, ambientación, historia, monstruos, misiones y jefes.
- **C. Nodos concretos del árbol de talentos.**
- **D. Tablas de balance:** curva de experiencia, atributos base, conversiones de estadísticas.

---

## Registro de cambios
| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 2026-11-11 | Primera versión del GDD a partir de la sesión de diseño inicial. |
