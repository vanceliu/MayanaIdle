import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { collectStoreDeltas } from '../sync';
import { TRAINING_GROUND_REGION_ID } from '../../../client/src/models/trainingGround';
import type { BagItem } from '../../../client/src/models/bagItem';

/** 試驗場本機沙盒的 server 端（`97-selfhosted-server.md` § 97.2） */
const RED_POTION = 1;
const ORANGE_POTION = 2;

describe('試驗場沙盒（server 端）', () => {
  let session: PlayerSession;

  beforeEach(async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    session = createPlayerSession(repo, '127.0.0.1', () => {});
    session.game.setState({ userId: 1 });
    await session.game.getState().createCharacter('Tester', 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
    session.game.setState({
      bagItems: [
        { itemId: RED_POTION, name: '紅色藥水', type: 'potion', amount: 5 },
        { itemId: ORANGE_POTION, name: '橙色藥水', type: 'potion', amount: 1 },
      ] as BagItem[],
    });
  });

  async function moveTo(regionId: string) {
    session.game.setState({ character: { ...session.game.getState().character!, currentRegion: regionId, currentArea: regionId, currentFloor: null } });
    await syncWorld(session);
  }

  const amountOf = (itemId: number) => session.game.getState().bagItems.find(b => b.itemId === itemId)?.amount ?? 0;

  it('試驗場內扣道具庫存', async () => {
    await moveTo(TRAINING_GROUND_REGION_ID);

    expect(session.game.getState().consumeTrainingItems([{ itemId: RED_POTION, amount: 2 }])).toBe(true);

    expect(amountOf(RED_POTION)).toBe(3);
  });

  it('試驗場外不扣', async () => {
    await moveTo('dawn-plains');

    expect(session.game.getState().consumeTrainingItems([{ itemId: RED_POTION, amount: 1 }])).toBe(false);

    expect(amountOf(RED_POTION)).toBe(5);
  });

  it.each([
    ['任一行庫存不足', [{ itemId: RED_POTION, amount: 1 }, { itemId: ORANGE_POTION, amount: 2 }]],
    ['數量非正整數', [{ itemId: RED_POTION, amount: 0 }]],
    ['數量不是整數', [{ itemId: RED_POTION, amount: 1.5 }]],
    ['空的清單', []],
  ])('%s：整筆不扣', async (_title, lines) => {
    await moveTo(TRAINING_GROUND_REGION_ID);

    expect(session.game.getState().consumeTrainingItems(lines)).toBe(false);

    expect(amountOf(RED_POTION)).toBe(5);
    expect(amountOf(ORANGE_POTION)).toBe(1);
  });

  it('離開試驗場：下一次推送是完整狀態', async () => {
    await moveTo(TRAINING_GROUND_REGION_ID);
    collectStoreDeltas(session);

    await moveTo('neutral-town');

    const delta = collectStoreDeltas(session);
    expect(delta?.game?.set).toHaveProperty('bagItems');
    expect(delta?.mapControl?.set).toHaveProperty('playerPosition');
  });

  it('一般換區：只送變動的欄位', async () => {
    await moveTo('dawn-plains');
    collectStoreDeltas(session);

    await moveTo('neutral-town');

    expect(collectStoreDeltas(session)?.game?.set ?? {}).not.toHaveProperty('bagItems');
  });
});
