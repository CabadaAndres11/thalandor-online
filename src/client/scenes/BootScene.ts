import Phaser from 'phaser';
import { TILE_SIZE } from '../../sim/constants';

export const TILES_KEY = 'placeholder-tiles';

/** Generates placeholder textures (floor + wall tiles) until real pixel-art packs are chosen. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // Tile 0: floor
    g.fillStyle(0x2f3b2a).fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x364431).fillRect(2, 3, 2, 2).fillRect(10, 9, 2, 2).fillRect(6, 13, 1, 1);
    // Tile 1: wall
    g.fillStyle(0x56504a).fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x6e675f).fillRect(TILE_SIZE, 0, TILE_SIZE, 3);
    g.fillStyle(0x3d3833).fillRect(TILE_SIZE, TILE_SIZE - 2, TILE_SIZE, 2).fillRect(TILE_SIZE + 7, 3, 1, TILE_SIZE - 5);
    g.generateTexture(TILES_KEY, TILE_SIZE * 2, TILE_SIZE);
    g.destroy();
    this.game.events.emit('booted');
  }
}
