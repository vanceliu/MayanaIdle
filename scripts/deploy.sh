#!/usr/bin/env bash
#
# 部署到 gh-pages（docs/RELEASE.md 流程 A：不動任何版本）
#
# 這支腳本是把 RELEASE.md § 8 的檢查清單寫成程式，不是單純包一層 build + deploy。
# 每一項檢查都對應一個實際踩過的坑，失敗就中止，不會讓半套的東西上線。
#
# 用法：
#   ./scripts/deploy.sh            完整流程
#   ./scripts/deploy.sh --dry-run  只跑檢查與建置，不推上 gh-pages
#   ./scripts/deploy.sh --skip-tests  略過測試（趕時間時用，會警告）
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/client"
SITE_URL="https://vanceliu.github.io/MayanaIdle/"

DRY_RUN=0
SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    -h|--help)    sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    # 變數後面緊接全形字時一律加大括號：bash 會把全形字併進變數名，
    # 在 set -u 下變成「unbound variable」而不是印出訊息
    *) echo "未知參數：${arg}（可用 --dry-run / --skip-tests）" >&2; exit 2 ;;
  esac
done

step()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()    { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[0;33m  ! %s\033[0m\n' "$*"; }
die()   { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO_ROOT"

# ── 1. 工作區必須乾淨 ───────────────────────────────────────────────
# RELEASE.md § 7.5：版本標示取的是最後一個 commit 的 SHA，
# 未提交的改動會讓線上標示指向上一個 commit，之後追問題會被誤導。
step "檢查工作區"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "有未提交的改動。先 commit 再部署（RELEASE.md § 7.5），否則版本標示會指錯 commit。"
fi
COMMIT_SHA="$(git rev-parse --short HEAD)"
ok "工作區乾淨，HEAD = $COMMIT_SHA"

# ── 2. 版本一致性 ──────────────────────────────────────────────────
# RELEASE.md § 1：客戶端與 Worker 的 CURRENT_DATA_VERSION 必須永遠相同。
# 不一致會讓所有寫入回 409（§ 7.1），而且那是部署後才會發現的災難。
step "檢查資料版本一致性"
CLIENT_VER="$(grep -oE 'CURRENT_DATA_VERSION *= *[0-9]+' "$CLIENT_DIR/src/config.ts" | grep -oE '[0-9]+$' || true)"
WORKER_FILE="$REPO_ROOT/leaderboard-worker/src/index.js"
if [[ -f "$WORKER_FILE" ]]; then
  WORKER_VER="$(grep -oE 'CURRENT_DATA_VERSION *= *[0-9]+' "$WORKER_FILE" | grep -oE '[0-9]+$' || true)"
else
  WORKER_VER=""
fi

if [[ -z "$CLIENT_VER" ]]; then
  warn "讀不到 client 的 CURRENT_DATA_VERSION，跳過比對"
elif [[ -n "$WORKER_VER" && "$CLIENT_VER" != "$WORKER_VER" ]]; then
  die "資料版本不一致：client=${CLIENT_VER} / worker=${WORKER_VER}。
     兩邊必須成對更新，否則所有寫入會回 409（RELEASE.md § 7.1）。
     提高版本時 Worker 必須先部署，改走 RELEASE.md § 5 流程 C。"
else
  ok "資料版本一致（v${CLIENT_VER:-?}）"
fi

# 最近一次 commit 若動過 config.ts，很可能是提高了資料版本 —— 那是流程 C，
# 必須 Worker 先部署（RELEASE.md § 5.3），用這支腳本會把順序做反。
if ! git diff --quiet HEAD~1 HEAD -- client/src/config.ts 2>/dev/null; then
  warn "最近一個 commit 動過 config.ts。"
  warn "若你提高了 CURRENT_DATA_VERSION，請改走 RELEASE.md § 5 流程 C（Worker 要先部署）。"
  read -r -p "  仍要繼續？(y/N) " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || die "已中止。"
fi

# ── 3. 型別檢查 ────────────────────────────────────────────────────
# CLAUDE.md：一律用 tsc -b。根 tsconfig 是 references 形式，
# tsc --noEmit 不會檢查任何檔案，是空跑。
step "型別檢查（tsc -b）"
cd "$CLIENT_DIR"
npx tsc -b
ok "無型別錯誤"

# ── 4. 測試 ────────────────────────────────────────────────────────
if [[ "$SKIP_TESTS" == "1" ]]; then
  warn "已略過測試（--skip-tests）"
else
  step "測試（vitest run）"
  npx vitest run
  ok "測試全過"
fi

# ── 5. 建置 ────────────────────────────────────────────────────────
step "建置"
npm run build
ok "建置完成"

# ── 6. 建置產物必須內嵌正確的 commit SHA ──────────────────────────
# vite.config.ts 用 __BUILD_COMMIT__ 注入 git short SHA，
# 這是唯一能在線上確認「玩家跑的是哪一版」的依據（RELEASE.md § 7.2）。
step "驗證產物版本標示"
if grep -rqF "$COMMIT_SHA" dist/assets/*.js; then
  ok "產物內嵌 SHA = $COMMIT_SHA"
else
  die "產物找不到 ${COMMIT_SHA}。建置可能用了快取或 git 資訊取得失敗。"
fi

# ── 7. 部署 ────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "1" ]]; then
  step "--dry-run：略過部署"
  ok "檢查與建置皆通過，未推上 gh-pages"
  exit 0
fi

step "部署到 gh-pages"
npm run deploy
ok "已推送"

# ── 8. 線上驗證 ────────────────────────────────────────────────────
# 只確認新資產可取得 + SHA 正確。index.html 有 max-age=600（§ 7.2），
# 所以不比對 index.html 的內容 —— CDN 邊緣節點可能還握著舊副本，
# 那不代表部署失敗。
step "線上驗證"
MAIN_JS="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)"
[[ -n "$MAIN_JS" ]] || die "解析不出主 bundle 檔名"

for i in $(seq 1 20); do
  if curl -fsS --max-time 10 -o /dev/null "${SITE_URL}${MAIN_JS}"; then
    break
  fi
  [[ "$i" == "20" ]] && die "等待 ${MAIN_JS} 上線逾時（GitHub Pages 可能還在發佈）"
  sleep 5
done

if curl -fsS --max-time 20 "${SITE_URL}${MAIN_JS}" | grep -qF "$COMMIT_SHA"; then
  ok "線上 bundle 的版本標示 = $COMMIT_SHA"
else
  die "線上 bundle 找不到 $COMMIT_SHA"
fi

printf '\n\033[1;32m部署完成\033[0m  %s\n' "$SITE_URL"
printf '  版本標示：%s（畫面左下角應顯示這個 SHA）\n' "$COMMIT_SHA"
printf '  既有玩家最多 10 分鐘後才會拿到新的 index.html（RELEASE.md § 7.2），要立刻確認請強制重新整理。\n\n'
