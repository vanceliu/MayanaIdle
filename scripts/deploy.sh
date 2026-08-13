#!/usr/bin/env bash
#
# 部署到 gh-pages（docs/RELEASE.md 流程 A）
#
# 用法：
#   ./scripts/deploy.sh               完整流程
#   ./scripts/deploy.sh --dry-run     只跑檢查與建置，不推上 gh-pages
#   ./scripts/deploy.sh --skip-tests  略過測試
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
    -h|--help)    sed -n '2,9p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知參數：${arg}（可用 --dry-run / --skip-tests）" >&2; exit 2 ;;
  esac
done

step()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()    { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[0;33m  ! %s\033[0m\n' "$*"; }
die()   { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO_ROOT"

# ── 1. 工作區必須乾淨 ───────────────────────────────────────────────
step "檢查工作區"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "有未提交的改動。先 commit 再部署（RELEASE.md § 7.5），否則版本標示會指錯 commit。"
fi
COMMIT_SHA="$(git rev-parse --short HEAD)"
ok "工作區乾淨，HEAD = $COMMIT_SHA"

# ── 2. 版本一致性 ──────────────────────────────────────────────────
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

if ! git diff --quiet HEAD~1 HEAD -- client/src/config.ts 2>/dev/null; then
  warn "最近一個 commit 動過 config.ts。"
  warn "若你提高了 CURRENT_DATA_VERSION，請改走 RELEASE.md § 5 流程 C（Worker 要先部署）。"
  read -r -p "  仍要繼續？(y/N) " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || die "已中止。"
fi

# ── 3. 型別檢查 ────────────────────────────────────────────────────
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

# ── 6. 驗證產物版本標示 ────────────────────────────────────────────
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
# pipefail 下不可用 curl | grep -q 或 | head：提前關閉管道會讓上游非零，比對成功被判成失敗。
step "線上驗證"
MAIN_JS="$(grep -m1 -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html)"
[[ -n "$MAIN_JS" ]] || die "解析不出主 bundle 檔名"

for i in $(seq 1 20); do
  if curl -fsS --max-time 10 -o /dev/null "${SITE_URL}${MAIN_JS}"; then
    break
  fi
  [[ "$i" == "20" ]] && die "等待 ${MAIN_JS} 上線逾時（GitHub Pages 可能還在發佈）"
  sleep 5
done

ONLINE_BUNDLE="$(mktemp)"
trap 'rm -f "$ONLINE_BUNDLE"' EXIT
curl -fsS --max-time 30 -o "$ONLINE_BUNDLE" "${SITE_URL}${MAIN_JS}" \
  || die "抓不到線上 bundle ${MAIN_JS}"

if grep -qF "$COMMIT_SHA" "$ONLINE_BUNDLE"; then
  ok "線上 bundle 的版本標示 = $COMMIT_SHA"
else
  die "線上 bundle 找不到 $COMMIT_SHA"
fi

printf '\n\033[1;32m部署完成\033[0m  %s\n' "$SITE_URL"
printf '  版本標示：%s（畫面左下角應顯示這個 SHA）\n' "$COMMIT_SHA"
printf '  既有玩家最多 10 分鐘後才會拿到新的 index.html（RELEASE.md § 7.2），要立刻確認請強制重新整理。\n\n'
