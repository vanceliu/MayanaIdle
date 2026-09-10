#!/usr/bin/env bash
#
# 本機打包（docs/RELEASE.md § 3.2）：**只打這台機器的平台**。
# 正式發布走 GitHub Actions（打 tag），三平台在那裡各自原生打包；
# 本機打其他平台的產物用不到，還佔上百 MB。
#
# 用法：
#   ./scripts/release.sh                本機平台的桌面版 ＋ server 執行檔
#   ./scripts/release.sh --all-servers  server 執行檔也打其他兩個平台（需下載對應的 node）
#   ./scripts/release.sh --skip-tests   略過測試
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/client"
SERVER_DIR="$REPO_ROOT/server"
DESKTOP_DIR="$REPO_ROOT/desktop"

ALL_SERVERS=0
SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --all-servers) ALL_SERVERS=1 ;;
    --skip-tests)  SKIP_TESTS=1 ;;
    -h|--help)    sed -n '2,11p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知參數：${arg}（可用 --all-servers / --skip-tests）" >&2; exit 2 ;;
  esac
done

step()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()    { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
die()   { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO_ROOT"

# ── 1. 工作區必須乾淨：版本標示取的是 HEAD 的 SHA ─────────────────
step "檢查工作區"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "有未提交的改動。先 commit 再打包，否則執行檔裡的版本標示會指錯 commit。"
fi
ok "工作區乾淨（$(git rev-parse --short HEAD)）"

# ── 2. 型別檢查（一律 tsc -b，--noEmit 在這個 repo 是空跑） ────────
step "型別檢查"
(cd "$CLIENT_DIR" && npx tsc -b)
(cd "$SERVER_DIR" && npx tsc -b)
(cd "$DESKTOP_DIR" && npx tsc -p tsconfig.json)
ok "client、server、desktop 型別無誤"

# ── 3. 測試 ───────────────────────────────────────────────────────
if [[ $SKIP_TESTS -eq 1 ]]; then
  printf '  ! 略過測試\n'
else
  step "測試"
  (cd "$CLIENT_DIR" && npx vitest run)
  (cd "$SERVER_DIR" && npx vitest run)
  (cd "$DESKTOP_DIR" && npx vitest run)
  ok "全部通過"
fi

# ── 4. 建置前端與 server bundle ───────────────────────────────────
step "建置"
(cd "$CLIENT_DIR" && npm run build)
(cd "$SERVER_DIR" && npm run build)
ok "client/dist 與 server/dist 完成"

# ── 5. 打包 ───────────────────────────────────────────────────────
step "打包 server 執行檔"
if [[ $ALL_SERVERS -eq 1 ]]; then
  (cd "$SERVER_DIR" && node scripts/package.mjs --all)
else
  (cd "$SERVER_DIR" && node scripts/package.mjs)
fi

step "打包桌面版（本機平台）"
(cd "$DESKTOP_DIR" && npm run package)

step "產物"
ls -lh "$SERVER_DIR/release"
ls -lh "$DESKTOP_DIR/release" | grep -Ev "blockmap|unpacked|\.yml|^total"
