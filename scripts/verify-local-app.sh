#!/usr/bin/env bash
set -euo pipefail

# Compatibility gate only. Explicit isolated destinations are required by repository policy.
test -n "${DATABASE_URL:-}" && test -n "${TEST_DATABASE_URL:-}"
node --input-type=module - <<'JS'
const database = new URL(process.env.DATABASE_URL);
const tests = new URL(process.env.TEST_DATABASE_URL);
for (const url of [database, tests]) {
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.port === '54329')
    throw new Error('Compatibility verification requires explicit isolated loopback databases on a non-default port.');
}
if (database.host === tests.host && database.pathname === tests.pathname) throw new Error('Application and test destinations must be distinct.');
JS
npm run db:init
npm run db:seed
npm run db:schema-check
npm run test:integration
npm run build:local-app
npm run test:e2e
