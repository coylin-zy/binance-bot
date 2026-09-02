#!/usr/bin/env bash
set -euo pipefail

repo_dir="${FORWARD_REPO_DIR:-/home/ubuntu/binance-bot}"
run_id="${FORWARD_RUN_ID:-simplespot-v1-forward-v1}"
interval_seconds="${FORWARD_SAMPLE_INTERVAL_SECONDS:-300}"
run_dir="/freqtrade/user_data/forward_runs/${run_id}"

resolved_repo="$(readlink -f -- "$repo_dir")"
if [[ "$resolved_repo" != "/home/ubuntu/binance-bot" ]]; then
  echo "forward-sample: refusing unexpected repository path" >&2
  exit 1
fi

git_sha="$(git -C "$resolved_repo" rev-parse HEAD)"
strategy_sha="$(sha256sum "$resolved_repo/user_data/strategies/SimpleSpot.py" | awk '{print $1}')"
image_digest="$(docker inspect --format '{{.Image}}' freqtrade)"
freqtrade_version="$(docker exec freqtrade freqtrade --version | awk 'NR == 1 {print $2}')"

exec docker exec --user 1000:1000 --workdir /freqtrade freqtrade \
  python -m strategy_validation.forward_run sample \
  --run-dir "$run_dir" \
  --criteria /freqtrade/strategy_validation/dry-run-acceptance.json \
  --config /freqtrade/user_data/config.binance.json \
  --run-id "$run_id" \
  --interval-seconds "$interval_seconds" \
  --base-url http://127.0.0.1:8080 \
  --git-sha "$git_sha" \
  --strategy-sha "$strategy_sha" \
  --strategy-version SimpleSpot-v1 \
  --freqtrade-version "$freqtrade_version" \
  --docker-image-digest "$image_digest" \
  --protocol-version 1
