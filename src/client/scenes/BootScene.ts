import Phaser from 'phaser';
import { CATALOG } from '../../appearance/catalog';
import { preloadAllSheets, sheetUrl } from '../render/sheets';

export const TERRAIN_KEY = 'terrain';

/** Loads the LPC tileset (Phaser loader) and every character sheet (shared image cache), then emits 'booted'. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.image(TERRAIN_KEY, sheetUrl(CATALOG.tileset));
  }

  create(): void {
    preloadAllSheets()
      .catch((e: unknown) => console.error(e))
      .finally(() => this.game.events.emit('booted'));
  }
}
