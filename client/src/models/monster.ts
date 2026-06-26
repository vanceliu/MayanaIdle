export type MonsterSize = 'small' | 'large';
export type ElementType = 'fire' | 'ice' | 'wind' | 'earth' | 'light' | 'dark' | 'none';
export type MonsterRace = 'normal' | 'undead' | 'demon' | 'dragon';

export interface MonsterTemplate {
  id?: number;
  name: string;
  level: number;
  hp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  exp: number;
  race: MonsterRace;
  size: MonsterSize;
  element: ElementType;
  area: string;
  isBoss: boolean;
}

export interface MonsterInstance {
  templateId: number;
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  exp: number;
  race: MonsterRace;
  size: MonsterSize;
  element: ElementType;
  isBoss: boolean;
  _processed?: boolean;
}
