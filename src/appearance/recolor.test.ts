import { buildColorMap, layerPalette, recolorPixels } from './recolor';

test('buildColorMap maps each base color to the target ramp color', () => {
  const map = buildColorMap(['#000001', '#0000ff'], ['#ff0000', '#00ff00']);
  expect(map.get(0x000001)).toBe(0xff0000);
  expect(map.get(0x0000ff)).toBe(0x00ff00);
});

test('recolorPixels swaps mapped colors and keeps alpha and unmapped pixels', () => {
  const data = new Uint8ClampedArray([0, 0, 255, 200, 10, 20, 30, 255, 0, 0, 255, 0]);
  recolorPixels(data, buildColorMap(['#0000ff'], ['#112233']));
  expect([...data]).toEqual([0x11, 0x22, 0x33, 200, 10, 20, 30, 255, 0, 0, 255, 0]);
});

test('layerPalette resolves body, hair and fixed cloth palettes', () => {
  const appearance = { body: 'male', skin: 'olive', hairStyle: 'plain', hairColor: 'blonde' };
  expect(layerPalette({ material: 'body' }, appearance)).toEqual({ material: 'body', name: 'olive' });
  expect(layerPalette({ material: 'hair' }, appearance)).toEqual({ material: 'hair', name: 'blonde' });
  expect(layerPalette({ material: 'cloth', palette: 'forest' }, appearance)).toEqual({ material: 'cloth', name: 'forest' });
  expect(layerPalette(undefined, appearance)).toBeNull();
});
