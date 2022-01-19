import path from 'path';

// DAH! extension only support .pak mods.
export const MOD_FILE_EXT = '.pak';
export const GAME_ID = 'readyornot';
export const LO_FILE_NAME = 'loadOrder.json';

export function modsRelPath() {
  return path.join('ReadyOrNot', 'Content', 'Paks', '~mods');
}
