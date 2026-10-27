/**
 * 線上模式的試驗場本機沙盒（`97-selfhosted-server.md` § 97.2、`50-training-ground.md` § 50.4）。
 *
 * 角色在試驗場時，移動、木樁、戰鬥、量測、HP／MP／buff／冷卻在本機模擬；
 * 改到角色本身狀態的操作照常送 server，道具消耗以 `consumeTrainingItems` 扣 server 庫存。
 * 沙盒期間 server 推送的戰鬥執行期欄位不套用，本機存檔一律丟棄；離開時由 server 整份重送。
 */
import type { StoreApi } from 'zustand';
import { defaultSession } from '../stores/session';
import { useTrainingGroundStore } from '../stores/trainingGroundStore';
import type { GameRepository } from '../db/repository';
import type { BagItem } from '../models/bagItem';
import { TRAINING_GROUND_REGION_ID } from '../models/trainingGround';
import { resetCombat } from '../systems/combatLoop';
import type { ServerMessage, StoreDelta, StoreKey } from './protocol';

type Frame = Extract<ServerMessage, { t: 'frame' }>;
type SandboxStore = 'game' | 'mapControl' | 'combatCommand';
type ActionSet = Record<SandboxStore, Record<string, unknown>>;

/** 沙盒期間改用本機版本的 action */
export const SANDBOX_LOCAL_ACTIONS: Record<SandboxStore, readonly string[]> = {
  game: ['usePotionByType', 'useSpeedPotion', 'useQuickSlot', 'useCureItem', 'tickRegen', 'tickPersistent'],
  mapControl: ['moveToTarget', 'setAutoMove'],
  combatCommand: ['requestTarget'],
};

/** 沙盒期間不套用的推送欄位（`mapMonster` 與戰鬥 delta 整份不套用） */
const LOCAL_FIELDS: Partial<Record<StoreKey, ReadonlySet<string>>> = {
  game: new Set(['activeEffects', 'skills', 'lastPotionUsedAt', 'lastPotionCooldown']),
  mapControl: new Set(['playerPosition', 'prevPlayerPosition', 'targetPosition', 'currentPath', 'pathIndex', 'isMoving', 'autoMove', 'paused']),
};
const LOCAL_CHARACTER_FIELDS: ReadonlySet<string> = new Set(['hp', 'mp']);

/** 沙盒內的本機存檔目的地：寫入一律丟棄 */
const DISCARD_REPO = new Proxy({}, { get: () => async () => undefined }) as GameRepository;

let active = false;
let applyingServerFrame = false;
let localActions: ActionSet | null = null;
let remoteActions: ActionSet | null = null;
let onlineRepo: GameRepository | null = null;
let lastBag: BagItem[] = [];
let lastSearchMode: string | null = null;
let unsubscribeBag: (() => void) | null = null;

export function isTrainingSandbox(): boolean {
  return active;
}

function storeOf(key: SandboxStore): StoreApi<Record<string, unknown>> {
  return defaultSession[key] as unknown as StoreApi<Record<string, unknown>>;
}

function capture(): ActionSet {
  const out = {} as ActionSet;
  for (const key of Object.keys(SANDBOX_LOCAL_ACTIONS) as SandboxStore[]) {
    const state = storeOf(key).getState();
    out[key] = Object.fromEntries(SANDBOX_LOCAL_ACTIONS[key].map(name => [name, state[name]]));
  }
  return out;
}

function install(actions: ActionSet | null): void {
  if (!actions) return;
  for (const key of Object.keys(actions) as SandboxStore[]) storeOf(key).setState(actions[key]);
}

/** 前後兩份背包之間減少的數量 */
export function consumedLines(before: BagItem[], after: BagItem[]): { itemId: number; amount: number }[] {
  const lines: { itemId: number; amount: number }[] = [];
  for (const item of before) {
    const left = after.find(b => b.itemId === item.itemId)?.amount ?? 0;
    if (left < item.amount) lines.push({ itemId: item.itemId, amount: item.amount - left });
  }
  return lines;
}

/** `installOnlineProxies` 換上遠端代理前呼叫：記下本機版本（只記第一次，之後 store 上已是遠端代理） */
export function captureLocalActions(): void {
  localActions ??= capture();
}

/** `installOnlineProxies` 換上遠端代理後呼叫：記下遠端版本並開始同步沙盒內的道具消耗 */
export function captureRemoteActions(): void {
  remoteActions = capture();
  unsubscribeBag?.();
  unsubscribeBag = defaultSession.game.subscribe((state, prev) => {
    if (!active || applyingServerFrame || state.bagItems === prev.bagItems) return;
    const lines = consumedLines(lastBag, state.bagItems);
    lastBag = state.bagItems;
    if (lines.length > 0) void Promise.resolve(state.consumeTrainingItems(lines)).catch(() => {});
  });
}

function enter(): void {
  active = true;
  onlineRepo = defaultSession.repo;
  defaultSession.repo = DISCARD_REPO;
  install(localActions);
  resetCombat();
  defaultSession.mapMonster.getState().clearAll();
  const game = defaultSession.game.getState();
  lastBag = game.bagItems;
  lastSearchMode = game.searchMode;
  defaultSession.mapControl.getState().setAutoMove(game.searchMode === 'auto');
}

function exit(): void {
  active = false;
  install(remoteActions);
  if (onlineRepo) defaultSession.repo = onlineRepo;
  onlineRepo = null;
  useTrainingGroundStore.getState().stopIfRunning();
  resetCombat();
  defaultSession.mapMonster.getState().clearAll();
}

function leavesTraining(frame: Frame): boolean {
  const game = frame.stores?.game;
  if (game?.set && 'character' in game.set && game.set.character === null) return true;
  const character = (game?.set?.character ?? game?.merge?.character) as { currentRegion?: string } | undefined;
  return character?.currentRegion !== undefined && character.currentRegion !== TRAINING_GROUND_REGION_ID;
}

function filterDelta(key: StoreKey, delta: StoreDelta): StoreDelta | null {
  if (key === 'mapMonster') return null;
  const local = LOCAL_FIELDS[key];
  const out: StoreDelta = { ...delta };
  if (local && delta.set) out.set = Object.fromEntries(Object.entries(delta.set).filter(([field]) => !local.has(field)));
  if (key === 'game' && delta.merge?.character) {
    const character = Object.fromEntries(
      Object.entries(delta.merge.character as Record<string, unknown>).filter(([field]) => !LOCAL_CHARACTER_FIELDS.has(field)),
    );
    out.merge = { ...delta.merge, character };
  }
  return out;
}

/** 套用推送前：離開試驗場就結束沙盒；沙盒中回傳過濾後的 frame */
export function beforeServerFrame(frame: Frame): Frame {
  if (active && leavesTraining(frame)) exit();
  if (!active) return frame;
  const stores: Frame['stores'] = {};
  for (const [key, delta] of Object.entries(frame.stores ?? {})) {
    const filtered = filterDelta(key as StoreKey, delta);
    if (filtered) stores[key as StoreKey] = filtered;
  }
  return { ...frame, stores, combat: undefined, visuals: undefined };
}

/** 推送的 store 套用期間：背包變動來自 server，不是沙盒內的消耗 */
export function applyingServerStores(apply: () => void): void {
  applyingServerFrame = true;
  try {
    apply();
  } finally {
    applyingServerFrame = false;
  }
}

/** 套用推送後：進入試驗場就開始沙盒；沙盒中跟上搜尋模式與 server 的背包 */
export function afterServerFrame(): void {
  const game = defaultSession.game.getState();
  const inTraining = game.character?.currentRegion === TRAINING_GROUND_REGION_ID
    && defaultSession.mapControl.getState().currentMap?.id === TRAINING_GROUND_REGION_ID;
  if (!active) {
    if (inTraining) enter();
    return;
  }
  lastBag = game.bagItems;
  if (game.searchMode !== lastSearchMode) {
    lastSearchMode = game.searchMode;
    defaultSession.mapControl.getState().setAutoMove(game.searchMode === 'auto');
  }
}

/** 測試用：回到未進入沙盒的狀態 */
export function resetTrainingSandboxForTest(): void {
  if (active) exit();
  active = false;
  lastBag = [];
  lastSearchMode = null;
}
