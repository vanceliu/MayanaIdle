#!/usr/bin/env bash
#
# 部署 server 執行檔到雲端主機（docs/DEPLOY.md 步驟 2～4）。
# 首次：建 mayana 使用者、安裝、寫 server.properties、建 systemd 服務並啟動。
# 之後：停服務 → 換執行檔 → 啟動；server.properties 與資料庫不動。
#
# 用法：
#   ./scripts/deploy.sh                    GitHub Release 最新版
#   ./scripts/deploy.sh --version 0.8.22   指定 Release 版本
#   ./scripts/deploy.sh --file <tar.gz>    本機的 mayana-server-linux-x64.tar.gz
#
# 環境變數：DEPLOY_HOST（預設 admin@3.27.202.173）、DEPLOY_KEY（預設 connect_key/cloud/ssh-key-2026-09-29.key）
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_URL="https://github.com/vanceliu/MayanaIdle/releases"
ARCHIVE_NAME="mayana-server-linux-x64.tar.gz"
APP_DIR="/app/mayana"

HOST="${DEPLOY_HOST:-admin@3.27.202.173}"
KEY="${DEPLOY_KEY:-$REPO_ROOT/connect_key/cloud/ssh-key-2026-09-29.key}"

VERSION=""
FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?--version 需要版本號}"; shift 2 ;;
    --file)    FILE="${2:?--file 需要檔案路徑}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知參數：${1}（可用 --version / --file）" >&2; exit 2 ;;
  esac
done
[[ -n "$VERSION" && -n "$FILE" ]] && { echo "--version 與 --file 只能擇一" >&2; exit 2; }

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f "$KEY" ]] || die "找不到 SSH 金鑰：$KEY"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# ── 1. 取得執行檔 ─────────────────────────────────────────────────
step "取得 $ARCHIVE_NAME"
if [[ -n "$FILE" ]]; then
  [[ -f "$FILE" ]] || die "找不到檔案：$FILE"
  ARCHIVE="$FILE"
else
  if [[ -n "$VERSION" ]]; then url="$RELEASE_URL/download/$VERSION/$ARCHIVE_NAME"; else url="$RELEASE_URL/latest/download/$ARCHIVE_NAME"; fi
  ARCHIVE="$WORK_DIR/$ARCHIVE_NAME"
  curl -fL --progress-bar -o "$ARCHIVE" "$url" || die "下載失敗：$url"
fi
tar -tzf "$ARCHIVE" | grep -qx 'mayana-server-linux-x64' || die "$ARCHIVE 裡沒有 mayana-server-linux-x64"
ok "$(du -h "$ARCHIVE" | cut -f1)  ${url:-$ARCHIVE}"

# ── 2. 上傳 ───────────────────────────────────────────────────────
step "上傳到 $HOST"
scp "${SSH_OPTS[@]}" -q "$ARCHIVE" "$HOST:~/$ARCHIVE_NAME"
ok "已上傳"

# ── 3. 主機端：安裝或更新 ─────────────────────────────────────────
step "安裝到 $APP_DIR"
ssh "${SSH_OPTS[@]}" "$HOST" "bash -s -- '$APP_DIR' '$ARCHIVE_NAME'" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"
ARCHIVE="$HOME/$2"
BINARY="$APP_DIR/mayana-server-linux-x64"
PROPERTIES="$APP_DIR/server.properties"
UNIT="/etc/systemd/system/mayana.service"

if ! id mayana >/dev/null 2>&1; then
  sudo mkdir -p "$(dirname "$APP_DIR")"
  sudo useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin mayana
  echo "  建立使用者 mayana（家目錄 $APP_DIR）"
fi

if systemctl is-active --quiet mayana; then
  sudo systemctl stop mayana
  echo "  已停止 mayana 服務"
fi

sudo tar -xzf "$ARCHIVE" -C "$APP_DIR"
rm -f "$ARCHIVE"

# 只寫首次需要的鍵；其餘由 server 首次啟動補齊
if ! sudo test -f "$PROPERTIES"; then
  sudo tee "$PROPERTIES" >/dev/null <<'PROPS'
server-name=MayanaIdle
registration=open
admin-password=admin
trust-proxy=true
auto-open-browser=false
PROPS
  sudo chmod 600 "$PROPERTIES"
  echo "  寫入 server.properties"
fi

sudo chown -R mayana:mayana "$APP_DIR"

sudo tee "$UNIT" >/dev/null <<UNITFILE
[Unit]
Description=MayanaIdle server
After=network-online.target
Wants=network-online.target

[Service]
User=mayana
Group=mayana
WorkingDirectory=$APP_DIR
ExecStart=$BINARY --data-dir $APP_DIR
Restart=always
RestartSec=5
# graceful shutdown（flush 後關 DB）需要的時間
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNITFILE
sudo systemctl daemon-reload
sudo systemctl enable --quiet mayana
sudo systemctl start mayana

for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:25580/MayanaIdle/ || true)"
  [[ "$code" == "200" ]] && { echo "  http://127.0.0.1:25580/MayanaIdle/ → 200"; exit 0; }
  sleep 1
done
echo "  30 秒內未回 200（最後狀態 $code），最近的服務紀錄：" >&2
sudo journalctl -u mayana -n 30 --no-pager >&2
exit 1
REMOTE
ok "部署完成"
