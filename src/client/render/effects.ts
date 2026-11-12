import Phaser from 'phaser';
import type { CombatEvent } from '../../sim/combat/events';
import type { School } from '../../sim/combat/defs';
import type { EntityId, Vec2 } from '../../sim/types';
import { floatingText } from '../hud/hud-logic';
import { t } from '../i18n';

const SCHOOL_COLOR: Record<School, number> = {
  physical: 0xd8d0c0,
  holy: 0xf2e27a,
  fire: 0xf07a30,
  frost: 0x9ad0f5,
  arcane: 0xb07cf0,
  nature: 0x7cd05a,
};

const PROJECTILE_LOOK: Record<string, { color: number; radius: number; streak: boolean }> = {
  holy: { color: 0xf2e27a, radius: 4, streak: false },
  arcane: { color: 0xb07cf0, radius: 4, streak: false },
  arrow: { color: 0xe8dcc0, radius: 2, streak: true },
  net: { color: 0xc8a46a, radius: 6, streak: false },
  nature: { color: 0x7cd05a, radius: 4, streak: false },
  fire: { color: 0xf07a30, radius: 6, streak: false },
  frost: { color: 0x9ad0f5, radius: 4, streak: false },
  holy_fire: { color: 0xf0b040, radius: 5, streak: false },
};

const TEXT_STYLE: Record<'damage' | 'crit' | 'heal' | 'miss', { color: string; size: number }> = {
  damage: { color: '#ffffff', size: 18 },
  crit: { color: '#ffd84a', size: 26 },
  heal: { color: '#7fe08a', size: 18 },
  miss: { color: '#b8b8c8', size: 16 },
};

/** Projectiles are drawn where they are in the simulation (their hitbox check covers the drawn bodies). */
const PROJECTILE_LIFT = 0;

interface Proj {
  obj: Phaser.GameObjects.Shape;
  vx: number;
  vy: number;
  until: number;
}

/** Combat visuals driven by host events: floating numbers, projectiles, areas and ground warnings. */
export class Effects {
  private readonly projectiles = new Map<number, Proj>();
  private readonly zones = new Set<Phaser.GameObjects.Arc>();

  constructor(
    private readonly scene: Phaser.Scene,
    /** Where a unit currently is on screen (for floating numbers). */
    private readonly unitPos: (id: EntityId) => Vec2 | null,
    /** Local player id: its own numbers are coloured differently. */
    private readonly selfId: () => EntityId | null,
  ) {}

  handle(list: CombatEvent[], now: number): void {
    for (const e of list) {
      switch (e.e) {
        case 'hit': {
          const f = floatingText(e);
          const p = this.unitPos(e.dst);
          if (!f || !p) break;
          const text = (f.text.startsWith('hud.') ? t(f.text) : f.text) + (e.blocked ? ` (${t('hud.blocked')})` : '');
          const style = TEXT_STYLE[f.kind];
          const hurtSelf = e.dst === this.selfId() && !e.heal && f.kind !== 'miss';
          this.floatText(p, text, hurtSelf ? '#ff6a5a' : style.color, style.size);
          break;
        }
        case 'proj': {
          const look = PROJECTILE_LOOK[e.look] ?? { color: 0xffffff, radius: 3, streak: false };
          const obj = look.streak
            ? this.scene.add.rectangle(e.x, e.y - PROJECTILE_LIFT, 14, 2, look.color).setRotation(Math.atan2(e.vy, e.vx))
            : this.scene.add.circle(e.x, e.y - PROJECTILE_LIFT, look.radius, look.color).setStrokeStyle(1, 0xffffff, 0.6);
          obj.setDepth(5e5);
          this.projectiles.set(e.id, { obj, vx: e.vx, vy: e.vy, until: now + e.ttlMs + 200 });
          break;
        }
        case 'projEnd': {
          const p = this.projectiles.get(e.id);
          if (p) {
            p.obj.destroy();
            this.projectiles.delete(e.id);
          }
          this.ring({ x: e.x, y: e.y - PROJECTILE_LIFT }, 10, 0xffffff, 180);
          break;
        }
        case 'tele': {
          const color = e.hostile ? 0xe04030 : 0x60a0ff;
          const outline = this.scene.add.circle(e.x, e.y, e.r).setStrokeStyle(2, color, 0.9).setFillStyle(color, 0.12).setDepth(1);
          const fill = this.scene.add.circle(e.x, e.y, e.r, color, 0.35).setScale(0).setDepth(1);
          this.scene.tweens.add({
            targets: fill,
            scale: 1,
            duration: e.ms,
            onComplete: () => {
              fill.destroy();
              outline.destroy();
            },
          });
          break;
        }
        case 'area':
          this.ring({ x: e.x, y: e.y }, e.r, SCHOOL_COLOR[e.school], 350);
          break;
        case 'zone': {
          const color = SCHOOL_COLOR[e.school];
          const z = this.scene.add.circle(e.x, e.y, e.r, color, 0.16).setStrokeStyle(2, color, 0.7).setDepth(1);
          this.zones.add(z);
          this.scene.tweens.add({
            targets: z,
            alpha: 0.45,
            yoyo: true,
            repeat: -1,
            duration: 500,
          });
          this.scene.time.delayedCall(e.ms, () => {
            this.zones.delete(z);
            z.destroy();
          });
          break;
        }
        case 'levelup': {
          const p = this.unitPos(e.id);
          if (!p) break;
          this.ring(p, 40, 0xf2d060, 700);
          this.ring(p, 24, 0xfff0a0, 500);
          this.floatText(p, t('hud.level', { level: e.level }), '#ffd84a', 24);
          break;
        }
        case 'proc': {
          const p = this.unitPos(e.id);
          if (p) this.floatText(p, t(`passive.${e.passiveId}`), '#ffd84a', 18);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Moves projectiles between events (they travel straight at constant speed). */
  update(deltaMs: number, now: number): void {
    for (const [id, p] of this.projectiles) {
      if (now > p.until) {
        p.obj.destroy();
        this.projectiles.delete(id);
        continue;
      }
      p.obj.x += (p.vx * deltaMs) / 1000;
      p.obj.y += (p.vy * deltaMs) / 1000;
    }
  }

  destroy(): void {
    for (const p of this.projectiles.values()) p.obj.destroy();
    this.projectiles.clear();
    for (const z of this.zones) z.destroy();
    this.zones.clear();
  }

  private ring(at: Vec2, r: number, color: number, ms: number): void {
    const c = this.scene.add.circle(at.x, at.y, r).setStrokeStyle(3, color, 0.9).setFillStyle(color, 0.18).setDepth(2).setScale(0.3);
    this.scene.tweens.add({ targets: c, scale: 1, alpha: 0, duration: ms, onComplete: () => c.destroy() });
  }

  private floatText(at: Vec2, text: string, color: string, size: number): void {
    const label = this.scene.add
      .text(at.x + (Math.random() - 0.5) * 12, at.y - 46, text, { fontFamily: 'Georgia, serif', fontSize: `${size}px`, color, stroke: '#101010', strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setScale(0.5)
      .setResolution(2)
      .setDepth(1e6 + 1);
    this.scene.tweens.add({ targets: label, y: label.y - 22, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => label.destroy() });
  }
}
