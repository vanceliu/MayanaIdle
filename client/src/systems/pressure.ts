export interface PressureState {
  areaEnteredAt: number;
  pressure: number;
  maxMonsters: number;
}

const BASE_MAX_MONSTERS = 3;
const MAX_MONSTERS_CAP = 10;

export function calculatePressure(enteredAt: number, now: number): PressureState {
  const elapsedMinutes = (now - enteredAt) / (1000 * 60);
  const pressure = Math.max(0, Math.floor((elapsedMinutes - 30) / 10));
  const maxMonsters = Math.min(MAX_MONSTERS_CAP, BASE_MAX_MONSTERS + pressure);

  return { areaEnteredAt: enteredAt, pressure, maxMonsters };
}
