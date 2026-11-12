import { parseIcon, type Glyph } from './hud-logic';

const cache = new Map<string, string>();

/** Draws a provisional square ability icon (school colour + simple glyph) and returns a data URL. */
export function iconUrl(spec: string, size = 44): string {
  const key = `${spec}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { glyph, color } = parseIcon(spec);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, shade(color, 0.55));
  grad.addColorStop(1, shade(color, 0.18));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = shade(color, 1.25);
  g.fillStyle = shade(color, 1.25);
  g.lineWidth = Math.max(2, size / 14);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.save();
  g.translate(size / 2, size / 2);
  g.scale(size / 44, size / 44);
  drawGlyph(g, glyph);
  g.restore();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function line(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

function drawGlyph(g: CanvasRenderingContext2D, glyph: Glyph): void {
  switch (glyph) {
    case 'sword':
      line(g, [[-11, 11], [11, -11]]);
      line(g, [[-12, 4], [-4, 12]]);
      break;
    case 'dagger':
      line(g, [[-6, 6], [9, -9]]);
      line(g, [[-9, 1], [-1, 9]]);
      break;
    case 'axe':
      line(g, [[-10, 12], [6, -8]]);
      g.beginPath();
      g.arc(6, -8, 8, Math.PI * 0.75, Math.PI * 1.85);
      g.fill();
      break;
    case 'arrow':
      line(g, [[-12, 12], [10, -10]]);
      line(g, [[10, -10], [0, -10]]);
      line(g, [[10, -10], [10, 0]]);
      break;
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 5 : 13;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case 'cross':
      g.fillRect(-4, -13, 8, 26);
      g.fillRect(-13, -4, 26, 8);
      break;
    case 'shield':
      g.beginPath();
      g.moveTo(0, -13);
      g.lineTo(11, -8);
      g.quadraticCurveTo(10, 8, 0, 14);
      g.quadraticCurveTo(-10, 8, -11, -8);
      g.closePath();
      g.stroke();
      break;
    case 'drop':
      g.beginPath();
      g.moveTo(0, -13);
      g.quadraticCurveTo(11, 3, 0, 12);
      g.quadraticCurveTo(-11, 3, 0, -13);
      g.fill();
      break;
    case 'burst':
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(g, [[Math.cos(a) * 4, Math.sin(a) * 4], [Math.cos(a) * 13, Math.sin(a) * 13]]);
      }
      break;
    case 'bolt':
      line(g, [[4, -13], [-5, 1], [4, 1], [-4, 13]]);
      break;
    case 'wing':
      g.beginPath();
      g.moveTo(-12, 8);
      g.quadraticCurveTo(-2, -16, 13, -10);
      g.quadraticCurveTo(4, -4, 8, 2);
      g.quadraticCurveTo(-2, 0, -12, 8);
      g.fill();
      break;
    case 'snow':
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        line(g, [[Math.cos(a) * -12, Math.sin(a) * -12], [Math.cos(a) * 12, Math.sin(a) * 12]]);
      }
      break;
    case 'spiral':
      g.beginPath();
      for (let t = 0; t < Math.PI * 4; t += 0.2) {
        const r = 1 + t * 0.95;
        if (t) g.lineTo(Math.cos(t) * r, Math.sin(t) * r);
        else g.moveTo(r, 0);
      }
      g.stroke();
      break;
    case 'wind':
      for (const y of [-7, 0, 7]) {
        g.beginPath();
        g.moveTo(-12, y);
        g.quadraticCurveTo(4, y - 5, 12, y + 2);
        g.stroke();
      }
      break;
    case 'net':
      for (const v of [-8, 0, 8]) {
        line(g, [[v, -12], [v, 12]]);
        line(g, [[-12, v], [12, v]]);
      }
      break;
    case 'rain':
      for (const [x, y] of [[-8, -10], [2, -12], [10, -6], [-4, 0], [6, 4], [-10, 8], [0, 10]] as [number, number][]) line(g, [[x, y], [x - 3, y + 6]]);
      break;
  }
}
