#!/usr/bin/env bash
set -euo pipefail

npm run release:check
npm run corpus -- check
npm run format:check
npm run lint
npm run typecheck
npm run context:verify
npm run context:pack:test
npm run quality:structure
npm run test:anti-overfit
npm test
npm run build
npm run test:provenance
npm run security:dependencies
npm run security:secrets
npm run security:audit:test
npm run security:audit
npm run test:corpus
