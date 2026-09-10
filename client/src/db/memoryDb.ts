/**
 * 記憶體資料庫（`18-data-schema.md` § 18.12）。
 *
 * 正式路徑的持久層在 server（SQLite）；client 自己不存遊戲資料
 * （`97-selfhosted-server.md` § 97.5 廢止 IndexedDB）。這一份是 `MemoryRepository`
 * 的底層儲存，也給測試直接查驗持久化結果。
 *
 * 查詢介面刻意保留原本 Dexie 的形狀（`where().equals().toArray()`）——
 * 它只是測試用的查詢糖，換掉會讓數百個既有斷言跟著改寫，改動風險遠大於收益。
 */
import type { Character } from '../models/character';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import type { MonsterTemplate } from '../models/monster';
import type { TalentSlot } from '../models/talent';
import type { Mail } from '../models/mailbox';
import type { UserEntry, WarehouseEntry, DropTableEntry, BossDropTableEntry, CharacterBagEntry } from './rowTypes';
import type { ItemDefinition } from '../models/items';
import { MONSTER_SEEDS } from './seed/monsterSeeds';
import { EQUIPMENT_SEEDS } from './seed/equipmentSeeds';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from './seed/dropSeeds';
import { ITEM_DEFINITIONS } from './seed/itemSeeds';

type Row = { id?: number };

/** 一次查詢的中間結果；`equals` 之後才決定要拿什麼 */
class Query<T extends Row> {
  private readonly table: MemoryTable<T>;
  private readonly predicate: (row: T) => boolean;

  constructor(table: MemoryTable<T>, predicate: (row: T) => boolean) {
    this.table = table;
    this.predicate = predicate;
  }

  async toArray(): Promise<T[]> {
    return this.table.rows().filter(this.predicate);
  }

  async first(): Promise<T | undefined> {
    return this.table.rows().find(this.predicate);
  }

  async last(): Promise<T | undefined> {
    return this.table.rows().filter(this.predicate).at(-1);
  }

  async count(): Promise<number> {
    return this.table.rows().filter(this.predicate).length;
  }

  async delete(): Promise<void> {
    this.table.removeWhere(this.predicate);
  }

  async modify(changes: Partial<T>): Promise<void> {
    for (const row of this.table.rows().filter(this.predicate)) await this.table.update(row.id!, changes);
  }

  filter(extra: (row: T) => boolean): Query<T> {
    return new Query(this.table, row => this.predicate(row) && extra(row));
  }
}

class WhereClause<T extends Row> {
  private readonly table: MemoryTable<T>;
  private readonly field: keyof T;

  constructor(table: MemoryTable<T>, field: keyof T) {
    this.table = table;
    this.field = field;
  }

  equals(value: unknown): Query<T> {
    return new Query(this.table, row => row[this.field] === value);
  }
}

export class MemoryTable<T extends Row> {
  private store = new Map<number, T>();
  private nextId = 1;

  private readonly uniqueKey?: (row: T) => string;

  constructor(seed: T[] = [], uniqueKey?: (row: T) => string) {
    this.uniqueKey = uniqueKey;
    for (const row of seed) this.insert({ ...row });
  }

  rows(): T[] {
    return [...this.store.values()];
  }

  /** 同步寫入；唯一鍵重複即拋（對應 SQLite 的唯一索引） */
  private insert(row: T): number {
    if (this.uniqueKey) {
      const key = this.uniqueKey(row);
      if (this.rows().some(r => this.uniqueKey!(r) === key && r.id !== row.id)) {
        throw new Error(`唯一鍵重複：${key}`);
      }
    }
    const id = row.id ?? this.nextId;
    this.nextId = Math.max(this.nextId, id + 1);
    this.store.set(id, { ...row, id });
    return id;
  }

  async add(row: T): Promise<number> {
    return this.insert(row);
  }

  /** 指定 id 覆寫；沒有就新增（Dexie `put` 的語意） */
  async put(row: T): Promise<number> {
    if (row.id !== undefined) this.store.delete(row.id);
    return this.insert(row);
  }

  async bulkAdd(rows: T[]): Promise<number[]> {
    return rows.map(r => this.insert(r));
  }

  async bulkPut(rows: T[]): Promise<void> {
    for (const row of rows) await this.put(row);
  }

  async get(id: number): Promise<T | undefined> {
    return this.store.get(id);
  }

  async update(id: number, changes: Partial<T>): Promise<void> {
    const row = this.store.get(id);
    if (row) this.store.set(id, { ...row, ...changes });
  }

  async delete(id: number): Promise<void> {
    this.store.delete(id);
  }

  async bulkDelete(ids: number[]): Promise<void> {
    for (const id of ids) this.store.delete(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
    this.nextId = 1;
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async toArray(): Promise<T[]> {
    return this.rows();
  }

  where(field: keyof T): WhereClause<T> {
    return new WhereClause(this, field);
  }

  filter(predicate: (row: T) => boolean): Query<T> {
    return new Query(this, predicate);
  }

  orderBy(field: keyof T): Query<T> {
    const sorted = () => this.rows().sort((a, b) => Number(a[field]) - Number(b[field]));
    return {
      first: async () => sorted()[0],
      last: async () => sorted().at(-1),
      toArray: async () => sorted(),
    } as unknown as Query<T>;
  }

  removeWhere(predicate: (row: T) => boolean): void {
    for (const row of this.rows().filter(predicate)) this.store.delete(row.id!);
  }

  snapshot(): { rows: Map<number, T>; nextId: number } {
    return { rows: new Map(this.store), nextId: this.nextId };
  }

  restore(snapshot: { rows: Map<number, unknown>; nextId: number }): void {
    this.store = snapshot.rows as Map<number, T>;
    this.nextId = snapshot.nextId;
  }
}

/** 金幣是 `userId → amount`，不是自增列 */
export class GoldTable {
  private store = new Map<number, number>();

  async get(userId: number): Promise<{ userId: number; amount: number } | undefined> {
    const amount = this.store.get(userId);
    return amount === undefined ? undefined : { userId, amount };
  }

  async put(row: { userId: number; amount: number }): Promise<void> {
    this.store.set(row.userId, row.amount);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  entries(): Map<number, number> {
    return new Map(this.store);
  }

  replace(entries: Map<number, number>): void {
    this.store = new Map(entries);
  }
}

/** 靜態模板隨程式碼發布（`97-selfhosted-server.md` § 97.4），開機即帶著 seed */
export class MemoryDb {
  readonly users = new MemoryTable<UserEntry>();
  readonly characters = new MemoryTable<Character>();
  readonly equipmentInstances = new MemoryTable<EquipmentInstance>();
  readonly characterBag = new MemoryTable<CharacterBagEntry>();
  readonly warehouses = new MemoryTable<WarehouseEntry>();
  readonly warehouseGold = new GoldTable();
  readonly talentSlots = new MemoryTable<TalentSlot>();
  /** (characterId, sourceKey) 唯一（`52-mailbox.md` § 52.7.1），與 SQLite 的唯一索引一致 */
  readonly mailbox = new MemoryTable<Mail>([], m => `${m.characterId}/${m.sourceKey}`);
  readonly equipmentTemplates = new MemoryTable<EquipmentTemplate>(EQUIPMENT_SEEDS as EquipmentTemplate[]);
  readonly monsterTemplates = new MemoryTable<MonsterTemplate>(MONSTER_SEEDS as MonsterTemplate[]);
  readonly dropTables = new MemoryTable<DropTableEntry>(DROP_TABLE_SEEDS as DropTableEntry[]);
  readonly bossDropTables = new MemoryTable<BossDropTableEntry>(BOSS_DROP_TABLE_SEEDS as BossDropTableEntry[]);
  readonly itemTemplates = new MemoryTable<ItemDefinition>(ITEM_DEFINITIONS as ItemDefinition[]);

  /** 玩家資料表（不含靜態模板），交易回捲與測試清空都以此為範圍 */
  get playerTables(): MemoryTable<Row>[] {
    return [
      this.users, this.characters, this.equipmentInstances, this.characterBag,
      this.warehouses, this.talentSlots, this.mailbox,
    ] as unknown as MemoryTable<Row>[];
  }
}
