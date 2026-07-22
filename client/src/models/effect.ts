export interface StatModifier {
  stat: string;
  value: number;
  isPercent: boolean;
}

export interface DotEffect {
  damage: number;
  element: string;
  interval: number;
  totalDuration: number;
}

export interface ActiveEffect {
  id: string;
  sourceSkillId: string;
  sourceSkillName: string;
  category: string;
  type: 'buff' | 'debuff';
  target: 'player' | 'monster';
  targetIdx?: number;
  targetMonsterId?: string;

  modifiers?: StatModifier[];
  dot?: DotEffect;
  stun?: boolean;
  special?: string;

  startTime: number;
  duration: number;

  tags: string[];
  name: string;
  description: string;
}
