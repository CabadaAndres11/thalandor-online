import type Phaser from 'phaser';

/** One text label pinned to a point of the world. */
export interface WorldLabel {
  /** World position of the label's bottom centre. */
  set(x: number, y: number, text: string, visible?: boolean): void;
  setColor(color: string): void;
  destroy(): void;
}

const registry = new WeakMap<Phaser.Scene, WorldLabels>();

/**
 * Names over characters, NPCs and loot drawn as HTML on top of the game canvas. The canvas uses
 * pixel-art (nearest) filtering and is stretched by the browser on scaled screens, which blurs
 * canvas text; HTML text stays sharp at any zoom or display scaling.
 */
export class WorldLabels {
  private readonly root: HTMLElement;
  private readonly items = new Set<{ el: HTMLElement; x: number; y: number; visible: boolean }>();

  constructor(
    private readonly scene: Phaser.Scene,
    parent: HTMLElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'world-labels';
    // First child: under every window and the HUD.
    parent.prepend(this.root);
    registry.set(scene, this);
  }

  static of(scene: Phaser.Scene): WorldLabels | undefined {
    return registry.get(scene);
  }

  create(className = 'world-label'): WorldLabel {
    const el = document.createElement('div');
    el.className = className;
    this.root.append(el);
    const item = { el, x: 0, y: 0, visible: false };
    this.items.add(item);
    return {
      set: (x, y, text, visible = true) => {
        item.x = x;
        item.y = y;
        item.visible = visible && text !== '';
        if (el.textContent !== text) el.textContent = text;
      },
      setColor: (color) => {
        el.style.color = color;
      },
      destroy: () => {
        el.remove();
        this.items.delete(item);
      },
    };
  }

  /** Moves every label to where its world point is on screen (call once per frame). */
  flush(): void {
    const cam = this.scene.cameras.main;
    const canvas = this.scene.game.canvas;
    // The canvas may be shown at a different CSS size than its pixel size.
    const sx = canvas.clientWidth / canvas.width || 1;
    const sy = canvas.clientHeight / canvas.height || 1;
    for (const it of this.items) {
      if (!it.visible) {
        it.el.style.display = 'none';
        continue;
      }
      const px = (it.x - cam.worldView.x) * cam.zoom * sx;
      const py = (it.y - cam.worldView.y) * cam.zoom * sy;
      it.el.style.display = '';
      it.el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px) translate(-50%, -100%)`;
    }
  }

  destroy(): void {
    this.root.remove();
    this.items.clear();
    registry.delete(this.scene);
  }
}
