#!/bin/bash
# اجرای آزمون‌های مرحله A — سرور dev در همین نشانه اجرا و پاک‌سازی می‌شود
set -u
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1

echo "=== [1/3] Starting dev server ==="
setsid bun run dev >/dev/null 2>&1 &
sleep 2

echo "=== [2/3] Waiting for server ==="
READY=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/system/status 2>/dev/null)
  if [ "$code" = "200" ]; then echo "server ready (attempt $i)"; READY=1; break; fi
  sleep 2
done
if [ "$READY" != "1" ]; then echo "FATAL: server did not start"; tail -20 dev.log; exit 1; fi

echo "=== [3/3] Running phase-A tests ==="
bun tests/phase-a-tests.mjs
TEST_EXIT=$?

pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1
echo "test exit code: $TEST_EXIT"
exit $TEST_EXIT
