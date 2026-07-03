const LEADERBOARD_API = 'https://leaderboard-api.westwind3122.workers.dev';

import { getTurnstileToken } from './turnstile';

export interface LeaderboardEntry {
  rank: number;
  character_id: string;
  character_name: string;
  class_name: string;
  value: number;
  updated_at: string;
}

export interface LeaderboardResponse {
  field: string;
  leaderboard: LeaderboardEntry[];
}

export type LeaderboardField =
  | 'character_level'
  | 'monstersKilled'
  | 'bossesKilled'
  | 'deathCount'
  | 'equipmentCrafted'
  | 'weaponEnhanceAttempts'
  | 'armorEnhanceAttempts'
  | 'weaponsBroken'
  | 'armorsBroken'
  | 'questsCompleted'
  | 'totalGoldEarned'
  | 'contribution';

export const LEADERBOARD_LABELS: Record<LeaderboardField, string> = {
  character_level: '等級',
  monstersKilled: '殺敵數',
  bossesKilled: 'BOSS 討伐',
  deathCount: '死亡次數',
  equipmentCrafted: '製作裝備',
  weaponEnhanceAttempts: '武器強化',
  armorEnhanceAttempts: '防具強化',
  weaponsBroken: '武器爆掉',
  armorsBroken: '防具爆掉',
  questsCompleted: '任務完成',
  totalGoldEarned: '金幣總量',
  contribution: '任務貢獻度',
};

export async function fetchLeaderboard(field: LeaderboardField, limit = 20): Promise<LeaderboardResponse> {
  const res = await fetch(`${LEADERBOARD_API}/api/leaderboard/${field}?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

export async function uploadStats(data: {
  character_id: string;
  character_name: string;
  character_level: number;
  class_name: string;
  monstersKilled: number;
  bossesKilled: number;
  deathCount: number;
  equipmentCrafted: number;
  weaponEnhanceAttempts: number;
  armorEnhanceAttempts: number;
  weaponsBroken: number;
  armorsBroken: number;
  questsCompleted: number;
  totalGoldEarned: number;
  contribution: number;
}): Promise<{ success: boolean }> {
  const turnstile_token = await getTurnstileToken();
  const res = await fetch(`${LEADERBOARD_API}/api/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, turnstile_token }),
  });
  if (!res.ok) throw new Error('Failed to upload stats');
  return res.json();
}
