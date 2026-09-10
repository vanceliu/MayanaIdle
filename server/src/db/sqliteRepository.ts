/**
 * `GameRepository` 的 SQLite 實作（`97-selfhosted-server.md` § 97.4）。
 * 複合欄位以 JSON 存於 `data`，查詢鍵另立欄位；靜態模板隨程式碼載入記憶體（§ 97.4）。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { GameRepository } from '../../../client/src/db/repository';
import type { Character } from '../../../client/src/models/character';
import type { EquipmentInstance, EquipmentTemplate } from '../../../client/src/models/equipment';
import type { MonsterTemplate } from '../../../client/src/models/monster';
import type { TalentSlot } from '../../../client/src/models/talent';
import type { Mail } from '../../../client/src/models/mailbox';
import type {
  UserEntry, WarehouseEntry, DropTableEntry, BossDropTableEntry, CharacterBagEntry,
} from '../../../client/src/db/rowTypes';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { MONSTER_SEEDS } from '../../../client/src/db/seed/monsterSeeds';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../../../client/src/db/seed/dropSeeds';
import { characterNameKey } from '../../../client/src/models/characterIdentity';

type Row = Record<string, unknown>;

function parseRow<T>(row: Row | undefined): T | undefined {
  if (!row) return undefined;
  const data = JSON.parse(row.data as string) as Record<string, unknown>;
  return { ...data, id: row.id } as T;
}

function parseRows<T>(rows: Row[]): T[] {
  return rows.map(r => parseRow<T>(r)!);
}

function stripId<T extends { id?: number }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value;
  return rest;
}

export class SqliteRepository implements GameRepository {
  private readonly db: DatabaseSync;
  private readonly equipmentTemplates: EquipmentTemplate[];
  private readonly equipmentById: Map<number, EquipmentTemplate>;
  private readonly monsterByArea: Map<string, MonsterTemplate[]>;
  private readonly dropByArea: Map<string, DropTableEntry[]>;
  private readonly bossDropByName: Map<string, BossDropTableEntry[]>;
  private txDepth = 0;
  private txQueue: Promise<void> = Promise.resolve();

  constructor(db: DatabaseSync) {
    this.db = db;
    this.equipmentTemplates = EQUIPMENT_SEEDS;
    this.equipmentById = new Map(EQUIPMENT_SEEDS.map(t => [t.id!, t]));
    this.monsterByArea = new Map();
    for (const m of MONSTER_SEEDS) {
      const list = this.monsterByArea.get(m.area) ?? [];
      list.push(m);
      this.monsterByArea.set(m.area, list);
    }
    this.dropByArea = new Map();
    for (const d of DROP_TABLE_SEEDS as DropTableEntry[]) {
      const list = this.dropByArea.get(d.area) ?? [];
      list.push(d);
      this.dropByArea.set(d.area, list);
    }
    this.bossDropByName = new Map();
    for (const d of BOSS_DROP_TABLE_SEEDS as BossDropTableEntry[]) {
      const list = this.bossDropByName.get(d.bossName) ?? [];
      list.push(d);
      this.bossDropByName.set(d.bossName, list);
    }
  }

  // ---------- users ----------
  async firstUser() {
    const row = this.db.prepare('SELECT id, created_at FROM users ORDER BY created_at ASC LIMIT 1').get() as Row | undefined;
    return row ? { id: row.id as number, createdAt: row.created_at as number } satisfies UserEntry : undefined;
  }
  async addUser(user: UserEntry) {
    const r = this.db.prepare('INSERT INTO users (username, created_at) VALUES (?, ?)').run(`user-${Date.now()}`, user.createdAt);
    return Number(r.lastInsertRowid);
  }

  // ---------- characters ----------
  async listCharacters(userId: number) {
    return parseRows<Character>(this.db.prepare('SELECT id, data FROM characters WHERE user_id = ? ORDER BY id').all(userId) as Row[]);
  }
  async getCharacter(id: number) {
    return parseRow<Character>(this.db.prepare('SELECT id, data FROM characters WHERE id = ?').get(id) as Row | undefined);
  }
  async lastCharacter(userId: number) {
    return parseRow<Character>(this.db.prepare('SELECT id, data FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as Row | undefined);
  }
  async countCharacters(userId: number) {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM characters WHERE user_id = ?').get(userId) as { n: number };
    return row.n;
  }
  async addCharacter(char: Character) {
    // `name_key` 由唯一索引把關（`db/sqlite.ts` schema v2）：重名會在這裡就被 SQLite 擋下
    const r = this.db.prepare('INSERT INTO characters (user_id, uuid, name_key, data) VALUES (?, ?, ?, ?)')
      .run(char.userId, char.uuid ?? crypto.randomUUID(), characterNameKey(char.name), JSON.stringify(stripId(char)));
    return Number(r.lastInsertRowid);
  }
  async updateCharacter(id: number, changes: Partial<Character>) {
    const current = await this.getCharacter(id);
    if (!current) return;
    const next = stripId({ ...current, ...changes });
    this.db.prepare('UPDATE characters SET name_key = ?, data = ? WHERE id = ?')
      .run(characterNameKey(next.name), JSON.stringify(next), id);
  }
  /** 這個名稱有沒有人用了（`19-account-character.md` § 19.4：本服唯一） */
  nameTaken(name: string): boolean {
    const row = this.db.prepare('SELECT 1 AS hit FROM characters WHERE name_key = ? LIMIT 1').get(characterNameKey(name));
    return !!row;
  }
  async deleteCharacter(id: number) {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  }

  // ---------- equipment instances ----------
  async listEquipmentByOwner(ownerId: number) {
    return parseRows<EquipmentInstance>(this.db.prepare('SELECT id, data FROM equipment_instances WHERE owner_id = ? ORDER BY id').all(ownerId) as Row[]);
  }
  async listSharedWarehouseEquipment(userId: number) {
    return (await this.listEquipmentByOwner(userId)).filter(i => i.inStorage === true && i.storageType === 'shared');
  }
  async addEquipment(record: Partial<EquipmentInstance>) {
    const r = this.db.prepare('INSERT INTO equipment_instances (owner_id, data) VALUES (?, ?)')
      .run(record.ownerId ?? 0, JSON.stringify(stripId(record)));
    return Number(r.lastInsertRowid);
  }
  async bulkAddEquipment(records: Partial<EquipmentInstance>[]) {
    const ids: number[] = [];
    for (const r of records) ids.push(await this.addEquipment(r));
    return ids;
  }
  async updateEquipment(id: number, changes: Partial<EquipmentInstance>) {
    const row = this.db.prepare('SELECT id, data FROM equipment_instances WHERE id = ?').get(id) as Row | undefined;
    const current = parseRow<EquipmentInstance>(row);
    if (!current) return;
    const next = stripId({ ...current, ...changes });
    this.db.prepare('UPDATE equipment_instances SET owner_id = ?, data = ? WHERE id = ?').run(next.ownerId ?? 0, JSON.stringify(next), id);
  }
  async deleteEquipment(id: number) {
    this.db.prepare('DELETE FROM equipment_instances WHERE id = ?').run(id);
  }
  async bulkDeleteEquipment(ids: number[]) {
    const stmt = this.db.prepare('DELETE FROM equipment_instances WHERE id = ?');
    for (const id of ids) stmt.run(id);
  }
  async deleteCharacterEquipment(characterId: number) {
    const rows = await this.listEquipmentByOwner(characterId);
    await this.bulkDeleteEquipment(rows.filter(i => i.storageType !== 'shared').map(i => i.id!));
  }

  // ---------- bag ----------
  async listBag(characterId: number) {
    return parseRows<CharacterBagEntry>(this.db.prepare('SELECT id, data FROM character_bag WHERE character_id = ? ORDER BY id').all(characterId) as Row[]);
  }
  async replaceBag(characterId: number, entries: CharacterBagEntry[]) {
    await this.transaction(async () => {
      this.db.prepare('DELETE FROM character_bag WHERE character_id = ?').run(characterId);
      const stmt = this.db.prepare('INSERT INTO character_bag (character_id, item_template_id, data) VALUES (?, ?, ?)');
      for (const e of entries) stmt.run(characterId, e.itemTemplateId ?? null, JSON.stringify(stripId(e)));
    });
  }
  async deleteBag(characterId: number) {
    this.db.prepare('DELETE FROM character_bag WHERE character_id = ?').run(characterId);
  }
  async setBagItemAmount(characterId: number, itemTemplateId: number, amount: number) {
    if (amount <= 0) {
      this.db.prepare('DELETE FROM character_bag WHERE character_id = ? AND item_template_id = ?').run(characterId, itemTemplateId);
      return;
    }
    const rows = this.db.prepare('SELECT id, data FROM character_bag WHERE character_id = ? AND item_template_id = ?').all(characterId, itemTemplateId) as Row[];
    for (const row of rows) {
      const data = JSON.parse(row.data as string) as CharacterBagEntry;
      data.amount = amount;
      this.db.prepare('UPDATE character_bag SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id as number);
    }
  }

  // ---------- warehouses ----------
  async listSharedWarehouse(userId: number) {
    return parseRows<WarehouseEntry>(this.db.prepare("SELECT id, data FROM warehouses WHERE user_id = ? AND storage_type = 'shared' ORDER BY id").all(userId) as Row[]);
  }
  async listPersonalWarehouse(characterId: number) {
    return parseRows<WarehouseEntry>(this.db.prepare("SELECT id, data FROM warehouses WHERE character_id = ? AND storage_type = 'personal' ORDER BY id").all(characterId) as Row[]);
  }
  async replaceSharedWarehouse(userId: number, entries: WarehouseEntry[]) {
    await this.transaction(async () => {
      this.db.prepare("DELETE FROM warehouses WHERE user_id = ? AND storage_type = 'shared'").run(userId);
      const stmt = this.db.prepare('INSERT INTO warehouses (user_id, character_id, storage_type, data) VALUES (?, ?, ?, ?)');
      for (const e of entries) stmt.run(userId, null, 'shared', JSON.stringify(stripId({ ...e, storageType: 'shared' })));
    });
  }
  async replacePersonalWarehouse(characterId: number, entries: WarehouseEntry[]) {
    await this.transaction(async () => {
      this.db.prepare("DELETE FROM warehouses WHERE character_id = ? AND storage_type = 'personal'").run(characterId);
      const stmt = this.db.prepare('INSERT INTO warehouses (user_id, character_id, storage_type, data) VALUES (?, ?, ?, ?)');
      for (const e of entries) stmt.run(e.userId, characterId, 'personal', JSON.stringify(stripId({ ...e, storageType: 'personal', characterId })));
    });
  }
  async deletePersonalWarehouse(characterId: number) {
    this.db.prepare("DELETE FROM warehouses WHERE character_id = ? AND storage_type = 'personal'").run(characterId);
  }
  async getWarehouseGold(userId: number) {
    const row = this.db.prepare('SELECT amount FROM warehouse_gold WHERE user_id = ?').get(userId) as { amount: number } | undefined;
    return row?.amount ?? 0;
  }
  async putWarehouseGold(userId: number, amount: number) {
    this.db.prepare('INSERT INTO warehouse_gold (user_id, amount) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET amount = excluded.amount').run(userId, amount);
  }

  // ---------- talent slots ----------
  async listTalentSlots(characterId: number) {
    return parseRows<TalentSlot>(this.db.prepare('SELECT id, data FROM talent_slots WHERE character_id = ? ORDER BY id').all(characterId) as Row[]);
  }
  async countTalentSlots(characterId: number) {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM talent_slots WHERE character_id = ?').get(characterId) as { n: number };
    return row.n;
  }
  async addTalentSlot(slot: TalentSlot) {
    const r = this.db.prepare('INSERT INTO talent_slots (character_id, data) VALUES (?, ?)').run(slot.characterId, JSON.stringify(stripId(slot)));
    return Number(r.lastInsertRowid);
  }
  async updateTalentSlot(id: number, changes: Partial<TalentSlot>) {
    const current = parseRow<TalentSlot>(this.db.prepare('SELECT id, data FROM talent_slots WHERE id = ?').get(id) as Row | undefined);
    if (!current) return;
    this.db.prepare('UPDATE talent_slots SET data = ? WHERE id = ?').run(JSON.stringify(stripId({ ...current, ...changes })), id);
  }
  async bulkDeleteTalentSlots(ids: number[]) {
    const stmt = this.db.prepare('DELETE FROM talent_slots WHERE id = ?');
    for (const id of ids) stmt.run(id);
  }
  async deleteTalentSlots(characterId: number) {
    this.db.prepare('DELETE FROM talent_slots WHERE character_id = ?').run(characterId);
  }

  // ---------- mailbox ----------
  async listMail(characterId: number) {
    return parseRows<Mail>(this.db.prepare('SELECT id, data FROM mailbox WHERE character_id = ? ORDER BY id').all(characterId) as Row[]);
  }
  async getMail(id: number) {
    return parseRow<Mail>(this.db.prepare('SELECT id, data FROM mailbox WHERE id = ?').get(id) as Row | undefined);
  }
  async bulkAddMail(mails: Mail[]) {
    const stmt = this.db.prepare('INSERT INTO mailbox (character_id, source_key, data) VALUES (?, ?, ?)');
    for (const m of mails) stmt.run(m.characterId, m.sourceKey, JSON.stringify(stripId(m)));
  }
  async updateMail(id: number, changes: Partial<Mail>) {
    const current = await this.getMail(id);
    if (!current) return;
    this.db.prepare('UPDATE mailbox SET data = ? WHERE id = ?').run(JSON.stringify(stripId({ ...current, ...changes })), id);
  }
  async deleteMail(id: number) {
    this.db.prepare('DELETE FROM mailbox WHERE id = ?').run(id);
  }
  async bulkDeleteMail(ids: number[]) {
    const stmt = this.db.prepare('DELETE FROM mailbox WHERE id = ?');
    for (const id of ids) stmt.run(id);
  }
  async deleteMailByCharacter(characterId: number) {
    this.db.prepare('DELETE FROM mailbox WHERE character_id = ?').run(characterId);
  }

  // ---------- templates（記憶體） ----------
  async listEquipmentTemplates() { return this.equipmentTemplates; }
  async getEquipmentTemplate(id: number) { return this.equipmentById.get(id); }
  async findEquipmentTemplates(predicate: (t: EquipmentTemplate) => boolean) { return this.equipmentTemplates.filter(predicate); }
  async listDropTable(areaId: string) { return this.dropByArea.get(areaId) ?? []; }
  async listBossDropTable(bossName: string) { return this.bossDropByName.get(bossName) ?? []; }
  async listMonsterTemplates(area: string) { return this.monsterByArea.get(area) ?? []; }

  // ---------- prefs ----------
  async getCharacterPrefs(characterId: number) {
    const row = this.db.prepare('SELECT data FROM character_prefs WHERE character_id = ?').get(characterId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  async putCharacterPrefs(characterId: number, data: unknown) {
    this.db.prepare('INSERT INTO character_prefs (character_id, data) VALUES (?, ?) ON CONFLICT(character_id) DO UPDATE SET data = excluded.data').run(characterId, JSON.stringify(data));
  }
  async getBagLayout(characterId: number) {
    const row = this.db.prepare('SELECT data FROM bag_layouts WHERE character_id = ?').get(characterId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  async putBagLayout(characterId: number, data: unknown) {
    this.db.prepare('INSERT INTO bag_layouts (character_id, data) VALUES (?, ?) ON CONFLICT(character_id) DO UPDATE SET data = excluded.data').run(characterId, JSON.stringify(data));
  }
  async getMailPurgeVersion(characterId: number) {
    const row = this.db.prepare('SELECT version FROM mail_purge WHERE character_id = ?').get(characterId) as { version: string } | undefined;
    return row?.version ?? null;
  }
  async setMailPurgeVersion(characterId: number, version: string) {
    this.db.prepare('INSERT INTO mail_purge (character_id, version) VALUES (?, ?) ON CONFLICT(character_id) DO UPDATE SET version = excluded.version').run(characterId, version);
  }
  async deleteCharacterPrefs(characterId: number) {
    this.db.prepare('DELETE FROM character_prefs WHERE character_id = ?').run(characterId);
    this.db.prepare('DELETE FROM bag_layouts WHERE character_id = ?').run(characterId);
    this.db.prepare('DELETE FROM mail_purge WHERE character_id = ?').run(characterId);
  }

  /**
   * 交易以佇列序列化：node:sqlite 是同步 API，但 fn 內部有 await，
   * 序列化才能保證 ROLLBACK 只回滾這一筆。
   */
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txDepth > 0) return fn();
    const run = async () => {
      this.txDepth++;
      this.db.exec('BEGIN');
      try {
        const result = await fn();
        this.db.exec('COMMIT');
        return result;
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      } finally {
        this.txDepth--;
      }
    };
    const next = this.txQueue.then(run, run);
    this.txQueue = next.then(() => {}, () => {});
    return next;
  }
}
