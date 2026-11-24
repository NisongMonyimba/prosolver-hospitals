#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Existing Cloudflare resources are used. This command only checks local configuration."
./scripts/deploy.sh preflight
