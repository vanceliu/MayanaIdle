/**
 * 持久層介面（`97-selfhosted-server.md` § 97.4、`18-data-schema.md` § 18.12）。
 * server 以 SQLite 實作（`server/src/db/sqliteRepository.ts`），測試以記憶體實作（`memoryRepository.ts`）；
 * 遊戲邏輯只碰這個介面。
 */
import type { Character } from '../models/character';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import type { MonsterTemplate } from '../models/monster';
import type { TalentSlot } from '../models/talent';
import type { Mail } from '../models/mailbox';
import type {
  UserEntry, WarehouseEntry, DropTableEntry, BossDropTableEntry, CharacterBagEntry,
} from './rowTypes';

export interface GameRepository {
  firstUser(): Promise<UserEntry | undefined>;
  addUser(user: UserEntry): Promise<number>;

  listCharacters(userId: number): Promise<Character[]>;
  /**
   * 這個角色名稱是不是已經有人用了（`19-account-character.md` § 19.4：本服唯一）。
   *
   * 單機沒有別人，永遠回 false；SQLite 實作查 `name_key` 的唯一索引。
   */
  nameTaken(name: string): boolean;
  getCharacter(id: number): Promise<Character | undefined>;
  lastCharacter(userId: number): Promise<Character | undefined>;
  countCharacters(userId: number): Promise<number>;
  addCharacter(char: Character): Promise<number>;
  updateCharacter(id: number, changes: Partial<Character>): Promise<void>;
  deleteCharacter(id: number): Promise<void>;

  /** `ownerId` 為角色 id 或帳號 id（共用倉庫） */
  listEquipmentByOwner(ownerId: number): Promise<EquipmentInstance[]>;
  listSharedWarehouseEquipment(userId: number): Promise<EquipmentInstance[]>;
  addEquipment(record: Partial<EquipmentInstance>): Promise<number>;
  bulkAddEquipment(records: Partial<EquipmentInstance>[]): Promise<number[]>;
  updateEquipment(id: number, changes: Partial<EquipmentInstance>): Promise<void>;
  deleteEquipment(id: number): Promise<void>;
  bulkDeleteEquipment(ids: number[]): Promise<void>;
  /** 該角色持有的全部裝備（共用倉庫的除外） */
  deleteCharacterEquipment(characterId: number): Promise<void>;

  listBag(characterId: number): Promise<CharacterBagEntry[]>;
  replaceBag(characterId: number, entries: CharacterBagEntry[]): Promise<void>;
  deleteBag(characterId: number): Promise<void>;
  /** 數量 ≤ 0 即刪列 */
  setBagItemAmount(characterId: number, itemTemplateId: number, amount: number): Promise<void>;

  listSharedWarehouse(userId: number): Promise<WarehouseEntry[]>;
  listPersonalWarehouse(characterId: number): Promise<WarehouseEntry[]>;
  replaceSharedWarehouse(userId: number, entries: WarehouseEntry[]): Promise<void>;
  replacePersonalWarehouse(characterId: number, entries: WarehouseEntry[]): Promise<void>;
  deletePersonalWarehouse(characterId: number): Promise<void>;
  getWarehouseGold(userId: number): Promise<number>;
  putWarehouseGold(userId: number, amount: number): Promise<void>;

  listTalentSlots(characterId: number): Promise<TalentSlot[]>;
  countTalentSlots(characterId: number): Promise<number>;
  addTalentSlot(slot: TalentSlot): Promise<number>;
  updateTalentSlot(id: number, changes: Partial<TalentSlot>): Promise<void>;
  bulkDeleteTalentSlots(ids: number[]): Promise<void>;
  deleteTalentSlots(characterId: number): Promise<void>;

  listMail(characterId: number): Promise<Mail[]>;
  getMail(id: number): Promise<Mail | undefined>;
  bulkAddMail(mails: Mail[]): Promise<void>;
  updateMail(id: number, changes: Partial<Mail>): Promise<void>;
  deleteMail(id: number): Promise<void>;
  bulkDeleteMail(ids: number[]): Promise<void>;
  deleteMailByCharacter(characterId: number): Promise<void>;

  listEquipmentTemplates(): Promise<EquipmentTemplate[]>;
  getEquipmentTemplate(id: number): Promise<EquipmentTemplate | undefined>;
  findEquipmentTemplates(predicate: (t: EquipmentTemplate) => boolean): Promise<EquipmentTemplate[]>;
  listDropTable(areaId: string): Promise<DropTableEntry[]>;
  listBossDropTable(bossName: string): Promise<BossDropTableEntry[]>;
  listMonsterTemplates(area: string): Promise<MonsterTemplate[]>;

  /** 綁角色的偏好（天賦配置、快捷鍵、任務進度等，`18-data-schema.md` § 18.6）；無資料回 null */
  getCharacterPrefs(characterId: number): Promise<unknown | null>;
  putCharacterPrefs(characterId: number, data: unknown): Promise<void>;
  getBagLayout(characterId: number): Promise<unknown | null>;
  putBagLayout(characterId: number, data: unknown): Promise<void>;
  /** 換版清理戳記（`52-mailbox.md` § 52.7.1）；無資料回 null */
  getMailPurgeVersion(characterId: number): Promise<string | null>;
  setMailPurgeVersion(characterId: number, version: string): Promise<void>;
  /** 刪角色時連同偏好、排列、戳記一併清除 */
  deleteCharacterPrefs(characterId: number): Promise<void>;

  /** 讀寫交易：內部全部成功才提交 */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
