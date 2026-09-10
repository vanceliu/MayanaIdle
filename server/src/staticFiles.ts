/**
 * 前端 bundle 的來源（`97-selfhosted-server.md` § 97.2 發布形態）。
 *
 * 兩種：從原始碼跑時讀磁碟上的 `client/dist`；單一執行檔則讀內嵌在執行檔裡的
 * SEA 資產。兩者對 HTTP 層長得一樣，`http.ts` 不必知道自己跑在哪一種。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import * as sea from 'node:sea';

/** 內嵌資產的鍵前綴：資料目錄以外的東西也可能進資產，前端要能自成一區 */
export const ASSET_PREFIX = 'client/';

export interface StaticSource {
  /** `rel` 是相對於前端 bundle 根目錄的路徑；找不到回 null */
  read(rel: string): Buffer | null;
  /** 用於記錄檔：這份前端是哪裡來的 */
  readonly describe: string;
}

/** 是不是跑在單一執行檔裡。`node:sea` 在非 SEA 的行程也載得起來，只是回 false */
export function isPackaged(): boolean {
  try {
    return sea.isSea();
  } catch {
    return false;
  }
}

export function diskStatic(dir: string): StaticSource {
  return {
    describe: dir,
    read(rel) {
      const file = normalize(join(dir, rel));
      // 目錄跳脫：`..` 進來就等於整台機器的檔案都能讀
      if (!file.startsWith(normalize(dir))) return null;
      if (!existsSync(file) || !statSync(file).isFile()) return null;
      return readFileSync(file);
    },
  };
}

export function seaStatic(): StaticSource {
  return {
    describe: '執行檔內嵌',
    read(rel) {
      try {
        return Buffer.from(sea.getRawAsset(ASSET_PREFIX + rel));
      } catch {
        // 找不到資產時 `getRawAsset` 直接拋，沒有「查詢是否存在」的便宜寫法
        return null;
      }
    },
  };
}
