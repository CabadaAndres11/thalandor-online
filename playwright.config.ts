import { defineConfig, devices } from '@playwright/test';

const VITE_PORT = 5180;
const PEER_PORT = 9000;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${VITE_PORT}`, ...devices['Desktop Chrome'] },
  webServer: [
    {
      // Local signaling server so E2E does not depend on the public PeerJS cloud.
      command: `npx peerjs --port ${PEER_PORT} --path /thalandor`,
      port: PEER_PORT,
      reuseExistingServer: true,
    },
    {
      command: `npx vite --port ${VITE_PORT} --strictPort`,
      port: VITE_PORT,
      reuseExistingServer: false,
      env: { VITE_PEER_HOST: 'localhost', VITE_PEER_PORT: String(PEER_PORT), VITE_PEER_PATH: '/thalandor' },
    },
  ],
});
