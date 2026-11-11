/**
 * ICE servers for WebRTC (GDD §2.5). Public STUN servers are free and cover most home routers.
 * Optional TURN relays (free tiers) can be supplied at build time:
 *   VITE_TURN_URLS="turn:host:3478,turns:host:443"  VITE_TURN_USERNAME=...  VITE_TURN_CREDENTIAL=...
 * If a friend still cannot connect, the zero-cost fallback is a virtual LAN such as Tailscale.
 */
export function getIceServers(env: Record<string, string | undefined> = import.meta.env): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  const turn = env.VITE_TURN_URLS?.split(',').map((u) => u.trim()).filter(Boolean);
  if (turn?.length) {
    servers.push({ urls: turn, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  return servers;
}
