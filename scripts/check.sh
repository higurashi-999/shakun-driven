#!/usr/bin/env bash
# push前の静的チェック：JSの構文と、index.htmlからの参照切れを確認する。
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
for f in js/*.js; do
  if command -v node >/dev/null 2>&1; then
    node --check "$f" || fail=1
  else
    echo "node がないため構文チェックを省略: $f"
  fi
done

if command -v node >/dev/null 2>&1 && [ -f tests/ledger.test.mjs ]; then
  node tests/ledger.test.mjs || fail=1
fi

for ref in css/style.css js/app.js; do
  if [ ! -f "$ref" ]; then
    echo "参照切れ: $ref が存在しません"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "CHECK FAILED"
  exit 1
fi
echo "CHECK OK"
