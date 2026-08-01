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

/** 持續回復（heal over time），與 DotEffect 對稱 */
export interface HotEffect {
  amount: number;
  interval: number;
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
  hot?: HotEffect;
  stun?: boolean;
  /** 無敵：完全免疫傷害（絕對屏障） */
  invincible?: boolean;
  /** 免疫所有負面狀態（§ 23.6 神聖領域） */
  immuneDebuff?: boolean;
  /** 護盾剩餘可吸收量（會隨受擊遞減，歸零時效果消失） */
  shieldRemaining?: number;
  special?: string;

  startTime: number;
  duration: number;

  tags: string[];
  name: string;
  description: string;
}
