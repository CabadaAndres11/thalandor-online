# Árbol de talentos circular: diseño

> Acordado en el chat el 2026-11-12 (tras probar la versión 0.4.0). Sustituye la estructura en columnas del anexo C del GDD.

## Idea
Un círculo en el que se avanza desde el centro en cualquier dirección. Cada dirección está orientada a unas estadísticas.

## Estructura (46 nodos, `data/talents.json`, generado con `npx tsx tools/gen-talents.ts`)
- **Inicio:** nodo central, gratis, común a todas las clases.
- **10 radios** de 4 nodos:
  - 5 **puros** en orden circular: Poderío, Celeridad, Vitalidad, Bastión y Arcano.
  - 5 **híbridos** entre cada pareja vecina. Cada nodo híbrido da el bonus principal de las dos direcciones al 60 % (al 100 % en el notable).
- **Anillos:** el 1.er y el 3.er paso de cada radio se unen con los de los radios vecinos.
- **Notables:** el 3.er nodo de cada radio, que vale el doble que uno normal.
- **Culminantes:** al final de cada radio puro, a 5 puntos del centro.

## Reglas
- Cada nodo cuesta 1 punto. Hay 1 punto por nivel desde el 2 (29 al nivel 30).
- Solo se puede comprar un nodo conectado al centro o a uno ya comprado.
- **Validación (host):** todos los nodos comprados existen, están conectados al centro por nodos comprados y no superan los puntos del nivel. Si no, se reinicia el árbol al unirse.
- **Reinicio:** solo completo, gratis fuera de combate.
- **Personajes con el árbol antiguo:** sus ids ya no existen, así que el host reinicia los talentos al unirse y el jugador recupera todos los puntos.
- **Futuro:** si sube el nivel máximo, se añaden anillos exteriores.

## Interfaz (N)
El círculo se dibuja en SVG:
- **Comprados:** encendidos.
- **Disponibles:** resaltados.
- **Caminos entre comprados:** iluminados.
- **Al pasar el ratón:** nombre y bonus.
- **Clic:** compra.
