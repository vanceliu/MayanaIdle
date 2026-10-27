/**
 * 公會的持久層（`18-data-schema.md` § 18.12 `guilds`／`guild_members`）。
 * `GuildManager` 開機時整份載入記憶體，之後每次變動同步寫入。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { ClassName } from '../../../client/src/models/character';
import type { EquipmentInstance } from '../../../client/src/models/equipment';
import { writeGateOf, type WriteGate } from './writeGate';

export interface GuildRecord {
  id: number;
  name: string;
  nameKey: string;
  leaderCharacterId: number;
  leaderCha: number;
  createdAt: number;
}

export interface GuildMemberRecord {
  characterId: number;
  guildId: number;
  name: string;
  className: ClassName;
  level: number;
  joinedAt: number;
}

/**
 * 公會倉庫裝備的 `ownerId`：**負的公會 id**。
 * 角色 id、帳號 id、公會 id 是三條各自遞增的序列，正數會撞號 ——
 * 依角色 id 查裝備（含刪角時的清除）會把同號公會的倉庫裝備一起帶走。
 */
export function guildOwnerId(guildId: number): number {
  return -guildId;
}

export function guildIdOfOwner(ownerId: number): number {
  return -ownerId;
}

export type MemberSnapshot = Pick<GuildMemberRecord, 'name' | 'className' | 'level'>;

/** 公會倉庫（`11-guild.md` § 11.8） */
export interface GuildWarehouseRecord {
  equipment: EquipmentInstance[];
  /** itemId → 數量 */
  items: Map<number, number>;
  gold: number;
}

/** 一次存取要落地的內容：裝備以整筆實例覆寫；道具給**存取後**的數量（0 ＝ 刪列）；金幣給存取後的餘額 */
export interface GuildWarehouseWrite {
  equipment: EquipmentInstance[];
  items: { itemId: number; amount: number }[];
  gold: number;
}

export interface GuildStorage {
  loadAll(): { guilds: GuildRecord[]; members: GuildMemberRecord[]; warehouses: Map<number, GuildWarehouseRecord> };
  /** 公會與盟主那一列一起寫入；名稱撞到唯一索引時拋錯 */
  createGuild(guild: Omit<GuildRecord, 'id'>, leader: Omit<GuildMemberRecord, 'guildId'>): Promise<number>;
  deleteGuild(guildId: number): Promise<void>;
  setLeaderCha(guildId: number, cha: number): Promise<void>;
  addMember(member: GuildMemberRecord): Promise<void>;
  removeMember(characterId: number): Promise<void>;
  updateMember(characterId: number, snapshot: MemberSnapshot): Promise<void>;
  /** 倉庫與裝備歸屬整批成立或整批不成立 */
  writeWarehouse(guildId: number, write: GuildWarehouseWrite): Promise<void>;
}

export class SqliteGuildStorage implements GuildStorage {
  private readonly db: DatabaseSync;
  /** 寫入一律走關卡（`writeGate.ts`） */
  private readonly gate: WriteGate;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.gate = writeGateOf(db);
  }

  loadAll() {
    const guilds = (this.db.prepare('SELECT id, name, name_key, leader_character_id, leader_cha, created_at FROM guilds').all() as Record<string, unknown>[])
      .map(r => ({
        id: r.id as number,
        name: r.name as string,
        nameKey: r.name_key as string,
        leaderCharacterId: r.leader_character_id as number,
        leaderCha: r.leader_cha as number,
        createdAt: r.created_at as number,
      }));
    const members = (this.db.prepare('SELECT character_id, guild_id, name, class_name, level, joined_at FROM guild_members').all() as Record<string, unknown>[])
      .map(r => ({
        characterId: r.character_id as number,
        guildId: r.guild_id as number,
        name: r.name as string,
        className: r.class_name as ClassName,
        level: r.level as number,
        joinedAt: r.joined_at as number,
      }));
    const warehouses = new Map<number, GuildWarehouseRecord>();
    const warehouseOf = (guildId: number) => {
      let w = warehouses.get(guildId);
      if (!w) warehouses.set(guildId, (w = { equipment: [], items: new Map(), gold: 0 }));
      return w;
    };
    for (const r of this.db.prepare('SELECT id, warehouse_gold FROM guilds').all() as { id: number; warehouse_gold: number }[]) {
      warehouseOf(r.id).gold = r.warehouse_gold;
    }
    for (const r of this.db.prepare('SELECT guild_id, item_id, amount FROM guild_warehouse_items').all() as { guild_id: number; item_id: number; amount: number }[]) {
      warehouseOf(r.guild_id).items.set(r.item_id, r.amount);
    }
    const equipmentRows = this.db.prepare(
      "SELECT id, owner_id, data FROM equipment_instances WHERE json_extract(data, '$.storageType') = 'guild'",
    ).all() as { id: number; owner_id: number; data: string }[];
    for (const r of equipmentRows) {
      warehouseOf(guildIdOfOwner(r.owner_id)).equipment.push({ ...(JSON.parse(r.data) as EquipmentInstance), id: r.id });
    }
    return { guilds, members, warehouses };
  }

  createGuild(guild: Omit<GuildRecord, 'id'>, leader: Omit<GuildMemberRecord, 'guildId'>): Promise<number> {
    return this.gate.atomic(() => {
      const r = this.db.prepare('INSERT INTO guilds (name, name_key, leader_character_id, leader_cha, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(guild.name, guild.nameKey, guild.leaderCharacterId, guild.leaderCha, guild.createdAt);
      const id = Number(r.lastInsertRowid);
      this.insertMember({ ...leader, guildId: id });
      return id;
    });
  }

  async deleteGuild(guildId: number): Promise<void> {
    // § 11.8：倉庫隨公會一併消失
    await this.gate.atomic(() => {
      this.db.prepare('DELETE FROM guild_members WHERE guild_id = ?').run(guildId);
      this.db.prepare('DELETE FROM guild_warehouse_items WHERE guild_id = ?').run(guildId);
      this.db.prepare("DELETE FROM equipment_instances WHERE owner_id = ? AND json_extract(data, '$.storageType') = 'guild'").run(guildOwnerId(guildId));
      this.db.prepare('DELETE FROM guilds WHERE id = ?').run(guildId);
    });
  }

  async setLeaderCha(guildId: number, cha: number): Promise<void> {
    await this.gate.write(() => this.db.prepare('UPDATE guilds SET leader_cha = ? WHERE id = ?').run(cha, guildId));
  }

  async addMember(member: GuildMemberRecord): Promise<void> {
    await this.gate.write(() => this.insertMember(member));
  }

  async removeMember(characterId: number): Promise<void> {
    await this.gate.write(() => this.db.prepare('DELETE FROM guild_members WHERE character_id = ?').run(characterId));
  }

  async updateMember(characterId: number, snapshot: MemberSnapshot): Promise<void> {
    await this.gate.write(() => this.db.prepare('UPDATE guild_members SET name = ?, class_name = ?, level = ? WHERE character_id = ?')
      .run(snapshot.name, snapshot.className, snapshot.level, characterId));
  }

  async writeWarehouse(guildId: number, write: GuildWarehouseWrite): Promise<void> {
    await this.gate.atomic(() => {
      const equip = this.db.prepare('UPDATE equipment_instances SET owner_id = ?, data = ? WHERE id = ?');
      for (const item of write.equipment) {
        const { id, ...data } = item;
        equip.run(item.ownerId ?? 0, JSON.stringify(data), id!);
      }
      const upsert = this.db.prepare('INSERT INTO guild_warehouse_items (guild_id, item_id, amount) VALUES (?, ?, ?) ON CONFLICT(guild_id, item_id) DO UPDATE SET amount = excluded.amount');
      const remove = this.db.prepare('DELETE FROM guild_warehouse_items WHERE guild_id = ? AND item_id = ?');
      for (const line of write.items) {
        if (line.amount > 0) upsert.run(guildId, line.itemId, line.amount);
        else remove.run(guildId, line.itemId);
      }
      this.db.prepare('UPDATE guilds SET warehouse_gold = ? WHERE id = ?').run(write.gold, guildId);
    });
  }

  private insertMember(m: GuildMemberRecord): void {
    this.db.prepare('INSERT INTO guild_members (character_id, guild_id, name, class_name, level, joined_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(m.characterId, m.guildId, m.name, m.className, m.level, m.joinedAt);
  }
}

/** 不落地的實作：`World` 未指定持久層時使用（測試） */
export class MemoryGuildStorage implements GuildStorage {
  private nextId = 1;
  loadAll() { return { guilds: [], members: [], warehouses: new Map<number, GuildWarehouseRecord>() }; }
  async createGuild(): Promise<number> { return this.nextId++; }
  async deleteGuild(): Promise<void> {}
  async setLeaderCha(): Promise<void> {}
  async addMember(): Promise<void> {}
  async removeMember(): Promise<void> {}
  async updateMember(): Promise<void> {}
  async writeWarehouse(): Promise<void> {}
}
