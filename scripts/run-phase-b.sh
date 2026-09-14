#!/bin/bash
# اجرای سرور dev و آزمون‌های مرحله B در یک نشانهٔ واحد (تا پردازش‌ها بین فراخوانی‌ها کشته نشوند)
set -u
cd /home/z/my-project

# پاک‌سازی هر سرور قبلی
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1

echo "=== [1/4] Starting dev server ==="
setsid bun run dev >/dev/null 2>&1 &
DEV_PGID=$!
sleep 2

echo "=== [2/4] Waiting for server ==="
READY=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/system/status 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "server ready (attempt $i)"
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" != "1" ]; then
  echo "FATAL: server did not start"
  tail -20 dev.log
  exit 1
fi

echo "=== [3/4] Running phase-B tests ==="
bun tests/phase-b-tests.mjs
TEST_EXIT=$?

echo "=== [4/4] Cleanup ==="
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
kill -"$DEV_PGID" 2>/dev/null
pkill -f "worker/worker.ts" 2>/dev/null
sleep 1
echo "test exit code: $TEST_EXIT"
exit $TEST_EXIT
