/** Shared test data. Not imported by game code. */
import { defaultAppearance, type ClassId } from './appearance/catalog';
import type { NetCharacter } from './net/protocol';

export function netChar(name: string, classId: ClassId = 'warrior', lastLocation: NetCharacter['lastLocation'] = null): NetCharacter {
  return { name, classId, appearance: defaultAppearance(classId), lastLocation };
}
