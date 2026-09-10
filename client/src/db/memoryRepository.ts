/**
 * `GameRepository` 的記憶體實作（`18-data-schema.md` § 18.12）。
 *
 * 正式路徑的持久層在 server（SQLite）；client 自己不再存遊戲資料
 * （`97-selfhosted-server.md` § 97.5 廢止清單）。這一份給測試用：
 * 語意對齊 SQLite 實作 —— 自增 id 由 1 起跳、查詢回插入順序、`transaction` 失敗即整批回捲。
 */
import type { GameRepository } from './repository';
import type { Character } from '../models/character';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import type { TalentSlot } from '../models/talent';
import type { Mail } from '../models/mailbox';
import type { WarehouseEntry, CharacterBagEntry, UserEntry } from './rowTypes';
import { bagLayoutStorageKey } from '../models/bagLayout';
import { talentBagOrderStorageKey } from '../models/talentBag';
import { mailPurgeStorageKey } from '../systems/mailbox';
import { characterNameKey } from '../models/characterIdentity';
import { MemoryDb } from './memoryDb';

export class MemoryRepository implements GameRepository {
  readonly db: MemoryDb;

  constructor(db: MemoryDb = new MemoryDb()) {
    this.db = db;
  }

  private get users() { return this.db.users; }
  private get characters() { return this.db.characters; }
  private get equipment() { return this.db.equipmentInstances; }
  private get bag() { return this.db.characterBag; }
  private get warehouses() { return this.db.warehouses; }
  private get talentSlots() { return this.db.talentSlots; }
  private get mailbox() { return this.db.mailbox; }

  async firstUser() {
    return [...this.users.rows()].sort((a, b) => a.createdAt - b.createdAt)[0];
  }

  async addUser(user: UserEntry) {
    return this.users.add(user);
  }

  async listCharacters(userId: number) {
    return this.characters.rows().filter(c => c.userId === userId);
  }

  nameTaken(name: string): boolean {
    const key = characterNameKey(name);
    return this.characters.rows().some(c => characterNameKey(c.name) === key);
  }

  async getCharacter(id: number) {
    return this.characters.get(id);
  }

  async lastCharacter(userId: number) {
    return this.characters.rows().filter(c => c.userId === userId).at(-1);
  }

  async countCharacters(userId: number) {
    return this.characters.rows().filter(c => c.userId === userId).length;
  }

  async addCharacter(char: Character) {
    return this.characters.add(char);
  }

  async updateCharacter(id: number, changes: Partial<Character>) {
    await this.characters.update(id, changes);
  }

  async deleteCharacter(id: number) {
    this.characters.delete(id);
  }

  async listEquipmentByOwner(ownerId: number) {
    return this.equipment.rows().filter(e => e.ownerId === ownerId);
  }

  async listSharedWarehouseEquipment(userId: number) {
    return this.equipment.rows().filter(e => e.ownerId === userId && e.inStorage === true && e.storageType === 'shared');
  }

  async addEquipment(record: Partial<EquipmentInstance>) {
    return this.equipment.add(record as EquipmentInstance);
  }

  async bulkAddEquipment(records: Partial<EquipmentInstance>[]) {
    return Promise.all(records.map(r => this.equipment.add(r as EquipmentInstance)));
  }

  async updateEquipment(id: number, changes: Partial<EquipmentInstance>) {
    await this.equipment.update(id, changes);
  }

  async deleteEquipment(id: number) {
    this.equipment.delete(id);
  }

  async bulkDeleteEquipment(ids: number[]) {
    for (const id of ids) this.equipment.delete(id);
  }

  async deleteCharacterEquipment(characterId: number) {
    this.equipment.removeWhere(e => e.ownerId === characterId && e.storageType !== 'shared');
  }

  async listBag(characterId: number) {
    return this.bag.rows().filter(b => b.characterId === characterId);
  }

  async replaceBag(characterId: number, entries: CharacterBagEntry[]) {
    this.bag.removeWhere(b => b.characterId === characterId);
    for (const entry of entries) await this.bag.add(entry);
  }

  async deleteBag(characterId: number) {
    this.bag.removeWhere(b => b.characterId === characterId);
  }

  async setBagItemAmount(characterId: number, itemTemplateId: number, amount: number) {
    const match = (b: CharacterBagEntry) => b.characterId === characterId && b.itemTemplateId === itemTemplateId;
    if (amount <= 0) this.bag.removeWhere(match);
    else for (const row of this.bag.rows().filter(match)) await this.bag.update(row.id!, { amount } as Partial<CharacterBagEntry>);
  }

  async listSharedWarehouse(userId: number) {
    return this.warehouses.rows().filter(w => w.userId === userId && (!w.storageType || w.storageType === 'shared'));
  }

  async listPersonalWarehouse(characterId: number) {
    return this.warehouses.rows().filter(w => w.characterId === characterId && w.storageType === 'personal');
  }

  async replaceSharedWarehouse(userId: number, entries: WarehouseEntry[]) {
    this.warehouses.removeWhere(w => w.userId === userId && (!w.storageType || w.storageType === 'shared'));
    for (const entry of entries) await this.warehouses.add(entry);
  }

  async replacePersonalWarehouse(characterId: number, entries: WarehouseEntry[]) {
    this.warehouses.removeWhere(w => w.characterId === characterId && w.storageType === 'personal');
    for (const entry of entries) await this.warehouses.add(entry);
  }

  async deletePersonalWarehouse(characterId: number) {
    this.warehouses.removeWhere(w => w.characterId === characterId && w.storageType === 'personal');
  }

  async getWarehouseGold(userId: number) {
    return (await this.db.warehouseGold.get(userId))?.amount ?? 0;
  }

  async putWarehouseGold(userId: number, amount: number) {
    await this.db.warehouseGold.put({ userId, amount });
  }

  async listTalentSlots(characterId: number) {
    return this.talentSlots.rows().filter(t => t.characterId === characterId);
  }

  async countTalentSlots(characterId: number) {
    return this.talentSlots.rows().filter(t => t.characterId === characterId).length;
  }

  async addTalentSlot(slot: TalentSlot) {
    return this.talentSlots.add(slot);
  }

  async updateTalentSlot(id: number, changes: Partial<TalentSlot>) {
    await this.talentSlots.update(id, changes);
  }

  async bulkDeleteTalentSlots(ids: number[]) {
    for (const id of ids) this.talentSlots.delete(id);
  }

  async deleteTalentSlots(characterId: number) {
    this.talentSlots.removeWhere(t => t.characterId === characterId);
  }

  async listMail(characterId: number) {
    return this.mailbox.rows().filter(m => m.characterId === characterId);
  }

  async getMail(id: number) {
    return this.mailbox.get(id);
  }

  async bulkAddMail(mails: Mail[]) {
    // 唯一鍵由資料表把關（重複即整批失敗，與 SQLite 一致）
    for (const mail of mails) await this.mailbox.add(mail);
  }

  async updateMail(id: number, changes: Partial<Mail>) {
    await this.mailbox.update(id, changes);
  }

  async deleteMail(id: number) {
    this.mailbox.delete(id);
  }

  async bulkDeleteMail(ids: number[]) {
    for (const id of ids) this.mailbox.delete(id);
  }

  async deleteMailByCharacter(characterId: number) {
    this.mailbox.removeWhere(m => m.characterId === characterId);
  }

  /* 靜態模板隨程式碼發布，開機就在 `MemoryDb` 裡（`97-selfhosted-server.md` § 97.4） */
  async listEquipmentTemplates() {
    return this.db.equipmentTemplates.rows();
  }

  async getEquipmentTemplate(id: number) {
    return this.db.equipmentTemplates.get(id);
  }

  async findEquipmentTemplates(predicate: (t: EquipmentTemplate) => boolean) {
    return this.db.equipmentTemplates.rows().filter(predicate);
  }

  async listDropTable(areaId: string) {
    return this.db.dropTables.rows().filter(d => d.area === areaId);
  }

  async listBossDropTable(bossName: string) {
    return this.db.bossDropTables.rows().filter(d => d.bossName === bossName);
  }

  async listMonsterTemplates(area: string) {
    return this.db.monsterTemplates.rows().filter(m => m.area === area);
  }

  /** 偏好、排列、戳記沿用 localStorage 的鍵（`18-data-schema.md` § 18.6） */
  async getCharacterPrefs(characterId: number) {
    return readJson(`mayana_prefs_${characterId}`);
  }

  async putCharacterPrefs(characterId: number, data: unknown) {
    localStorage.setItem(`mayana_prefs_${characterId}`, JSON.stringify(data));
  }

  async getBagLayout(characterId: number) {
    return readJson(bagLayoutStorageKey(characterId));
  }

  async putBagLayout(characterId: number, data: unknown) {
    localStorage.setItem(bagLayoutStorageKey(characterId), JSON.stringify(data));
  }

  async getMailPurgeVersion(characterId: number) {
    return localStorage.getItem(mailPurgeStorageKey(characterId));
  }

  async setMailPurgeVersion(characterId: number, version: string) {
    localStorage.setItem(mailPurgeStorageKey(characterId), version);
  }

  async deleteCharacterPrefs(characterId: number) {
    localStorage.removeItem(`mayana_prefs_${characterId}`);
    localStorage.removeItem(bagLayoutStorageKey(characterId));
    localStorage.removeItem(talentBagOrderStorageKey(characterId));
    localStorage.removeItem(mailPurgeStorageKey(characterId));
  }

  /** 失敗即回捲：先拍快照，拋錯就整批還原 */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const tables = this.db.playerTables;
    const snapshots = tables.map(t => t.snapshot());
    const gold = this.db.warehouseGold.entries();
    try {
      return await fn();
    } catch (e) {
      tables.forEach((t, i) => t.restore(snapshots[i]));
      this.db.warehouseGold.replace(gold);
      throw e;
    }
  }
}

function readJson(key: string): unknown | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
