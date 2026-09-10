/** log 一律走 stdout／stderr，不寫檔（`97-selfhosted-server.md` § 97.2） */
function stamp(): string {
  return new Date().toISOString();
}

export const log = {
  info: (msg: string, ...rest: unknown[]) => console.log(`${stamp()} [info] ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`${stamp()} [warn] ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`${stamp()} [error] ${msg}`, ...rest),
};
