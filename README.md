# Thalandor Online

RPG de acción 2D en pixel art, con vista cenital, para jugar online con hasta 4 amigos. El diseño completo está en [docs/GDD.md](docs/GDD.md).

## Cómo jugar

1. Abre el juego en el navegador (Chrome, Edge o Firefox en PC). El enlace de GitHub Pages se añadirá aquí al publicar.
2. Escribe tu nombre y pulsa **Jugar**. Entras a tu propia partida.
3. Para jugar con amigos, pulsa **Abrir grupo** (arriba a la derecha) y pásales el código de 6 caracteres. Al pulsar el código se copia.
4. Tus amigos escriben el código en **Código de grupo** y pulsan **Unirse a un amigo**.

**Controles:** WASD para moverse y Enter para abrir o enviar el chat (Esc lo cierra).

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

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/sim/` | Reglas del juego, en TypeScript puro y sin gráficos |
| `src/net/` | Protocolo y transportes (PeerJS/WebRTC y red en memoria para tests) |
| `src/host/` | Sesión del anfitrión, que corre en un Web Worker |
| `src/client/` | Phaser, interfaz, predicción e interpolación |
| `data/` | Contenido: mapas y textos (`data/i18n/es.json`) |
| `docs/` | GDD y planes de implementación |
