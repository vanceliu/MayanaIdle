export interface PressureState {
  areaEnteredAt: number;
  pressure: number;
  maxEncounterCount: number;
}

export function calculatePressure(enteredAt: number, now: number, partySize: number = 1): PressureState {
  const elapsedMinutes = (now - enteredAt) / (1000 * 60);
  const pressure = Math.max(0, Math.floor((elapsedMinutes - 30) / 10));
  const baseMax = partySize * 2;
  const maxEncounterCount = baseMax + pressure;

  return { areaEnteredAt: enteredAt, pressure, maxEncounterCount };
}

export function rollEncounterCount(partySize: number, pressure: number): number {
  const baseMin = partySize;
  const baseMax = partySize * 2 + pressure;
  return Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;
}

export function rollEncounter(): boolean {
  return Math.random() < 0.10; // 10% per tick (see 26-spawn-pressure.md §26.1)
}
