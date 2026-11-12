# Thalandor Online

RPG de acción 2D en pixel art, con vista cenital, para jugar online con hasta 4 amigos. El diseño completo está en [docs/GDD.md](docs/GDD.md).

## Cómo jugar

1. Abre **https://cabadaandres11.github.io/thalandor-online/** en el navegador (Chrome, Edge o Firefox en PC).
2. Crea tu personaje: nombre, clase y apariencia. Puedes tener hasta 8. Selecciónalo y pulsa **Jugar** para entrar en tu propia partida.
3. Para jugar con amigos, pulsa **Abrir grupo** (arriba a la derecha) y pásales el código de 6 caracteres. Al pulsar el código se copia.
4. Tus amigos escriben el código en **Código de grupo** y pulsan **Unirse a un amigo**.

**Tus personajes** se guardan en tu navegador y reapareces donde los dejaste. Con **Exportar** guardas una copia en un archivo, que también sirve para llevarlo a otro PC; con **Importar** la recuperas.

**Controles:**

| Acción | Tecla |
|---|---|
| Moverse | WASD |
| Apuntar | Ratón |
| Ataque básico (mantener para repetir) | Clic izquierdo |
| Ataque secundario | Clic derecho |
| Habilidades | 1 · 2 · 3 · 4 |
| Esquivar | Espacio |
| Levantar a un aliado derribado | Mantener E a su lado |
| Chat | Enter (Esc lo cierra) |

### Si un amigo no consigue conectar

La conexión es directa entre vuestros PCs (WebRTC). En algunas redes, más o menos 1 de cada 10, el router impide la conexión directa. Tenéis dos soluciones gratuitas:

- **Tailscale** (recomendado): instaladlo todos e iniciad sesión en la misma red de Tailscale. Después, volved a intentarlo.
- **Un relay TURN gratuito:** compilad el juego con `VITE_TURN_URLS`, `VITE_TURN_USERNAME` y `VITE_TURN_CREDENTIAL` (ver `src/net/ice-config.ts`).

## Desarrollo

Requiere Node.js 24 o superior.

```bash
npm install
npm run dev        # servidor de desarrollo en http://localhost:5173
npm test           # tests unitarios y de integración (Vitest)
npm run e2e        # tests en navegador con 4 jugadores (Playwright, señalización local)
npm run build      # build de producción en dist/
```

Si se cambia el mapa de prueba, se regenera con `npx tsx tools/gen-test-arena.ts`.

### Arte LPC

El arte de personajes y tiles procede de [Liberated Pixel Cup](https://lpc.opengameart.org/), con licencias CC-BY-SA, OGA-BY o GPL según cada pieza; la atribución completa está en [CREDITS.md](CREDITS.md). Las capas usadas se listan en `tools/lpc-selection.json`. Para reimportarlas después de cambiar esa lista:

```bash
npx tsx tools/import-lpc.ts <clon del repo LPC> <carpeta con atlas/terrain_atlas.png>
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/sim/` | Reglas del juego, en TypeScript puro y sin gráficos |
| `src/net/` | Protocolo y transportes (PeerJS/WebRTC y red en memoria para tests) |
| `src/host/` | Sesión del anfitrión, que corre en un Web Worker |
| `src/client/` | Phaser, interfaz, predicción e interpolación |
| `data/` | Contenido: mapas y textos (`data/i18n/es.json`) |
| `docs/` | GDD y planes de implementación |
