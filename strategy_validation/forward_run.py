#!/usr/bin/env python3
"""Collect and evaluate an immutable Freqtrade forward dry-run.

The collector uses only the authenticated, read-only Freqtrade REST API.  API
credentials are read from the runtime config for each sample and are never
written to the run directory.  A run remains ``collecting`` until the frozen
observation period has elapsed; a final verdict can only be ``passed`` or
``research_failed``.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from strategy_validation.acceptance import AcceptanceError, evaluate, read_json, validate_criteria


class ForwardRunError(ValueError):
    """Raised when a run manifest, sample, or evidence document is invalid."""


PROFIT_FIELDS = (
    "trade_count",
    "closed_trade_count",
    "profit_closed_coin",
    "profit_closed_ratio",
    "profit_factor",
    "max_drawdown",
    "bot_start_timestamp",
)

TRADE_FIELDS = (
    "trade_id",
    "pair",
    "strategy",
    "is_open",
    "open_timestamp",
    "open_fill_timestamp",
    "open_rate",
    "open_rate_requested",
    "close_timestamp",
    "close_rate",
    "close_rate_requested",
    "close_profit_abs",
    "profit_abs",
    "exit_reason",
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(encoded + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def _runtime_config(path: Path) -> dict[str, Any]:
    config = read_json(path)
    if config.get("dry_run") is not True:
        raise ForwardRunError("Forward collector refuses a runtime without dry_run=true")
    if config.get("trading_mode") != "spot":
        raise ForwardRunError("Forward collector requires spot trading_mode")
    exchange = config.get("exchange")
    if not isinstance(exchange, dict) or exchange.get("name") != "binance":
        raise ForwardRunError("Forward collector requires Binance global")
    api = config.get("api_server")
    if not isinstance(api, dict) or not api.get("username") or not api.get("password"):
        raise ForwardRunError("Freqtrade API credentials are not configured")
    return config


def initialize_run(
    run_dir: Path,
    criteria_path: Path,
    config_path: Path,
    *,
    run_id: str,
    interval_seconds: int = 300,
    lineage: dict[str, str] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Create an immutable run manifest without persisting credentials."""
    if not run_id.strip() or len(run_id) > 128:
        raise ForwardRunError("run_id must contain 1-128 characters")
    if interval_seconds < 60 or interval_seconds > 86400:
        raise ForwardRunError("interval_seconds must be between 60 and 86400")
    manifest_path = run_dir / "manifest.json"
    if manifest_path.exists():
        manifest = read_json(manifest_path)
        if manifest.get("run_id") != run_id:
            raise ForwardRunError("Existing run manifest has a different run_id")
        return manifest

    criteria_document = read_json(criteria_path)
    criteria = validate_criteria(criteria_document)
    config = _runtime_config(config_path)
    exchange = config["exchange"]
    started = now or _utc_now()
    wallet = config.get("dry_run_wallet")
    if isinstance(wallet, bool) or not isinstance(wallet, (int, float)) or wallet <= 0:
        raise ForwardRunError("dry_run_wallet must be a positive number")
    pairs = exchange.get("pair_whitelist")
    if not isinstance(pairs, list) or not pairs or not all(isinstance(pair, str) for pair in pairs):
        raise ForwardRunError("pair_whitelist must contain at least one pair")

    safe_lineage = {
        key: str((lineage or {}).get(key, "unknown"))[:256]
        for key in (
            "git_sha",
            "strategy_sha",
            "strategy_version",
            "freqtrade_version",
            "docker_image_digest",
            "protocol_version",
        )
    }
    manifest = {
        "schema_version": 1,
        "run_id": run_id,
        "status": "collecting",
        "started_at": _iso(started),
        "started_timestamp_ms": int(started.timestamp() * 1000),
        "sample_interval_seconds": interval_seconds,
        "criteria_version": criteria_document.get("version", "unversioned"),
        "criteria_sha256": _sha256(criteria_path),
        "minimum_observation_days": criteria["min_observation_days"],
        "runtime": {
            "dry_run": True,
            "dry_run_wallet": float(wallet),
            "exchange": "binance",
            "trading_mode": "spot",
            "timeframe": str(config.get("timeframe", "5m")),
            "pairs": pairs,
        },
        "lineage": safe_lineage,
    }
    _atomic_json(manifest_path, manifest)
    return manifest


class FreqtradeClient:
    def __init__(self, base_url: str, username: str, password: str, timeout: float = 10.0):
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ForwardRunError("Freqtrade base URL must use HTTP or HTTPS")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout = timeout
        self.token = ""

    def _request(self, path: str, *, method: str = "GET", basic: bool = False) -> Any:
        headers = {"Accept": "application/json"}
        if basic:
            raw = f"{self.username}:{self.password}".encode()
            headers["Authorization"] = "Basic " + base64.b64encode(raw).decode("ascii")
        elif self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(  # noqa: S310 - scheme is validated in __init__
            f"{self.base_url}/api/v1/{path}", headers=headers, method=method
        )
        with urllib.request.urlopen(  # noqa: S310 - scheme is validated in __init__
            request, timeout=self.timeout
        ) as response:
            return json.loads(response.read().decode("utf-8"))

    def login(self) -> None:
        payload = self._request("token/login", method="POST", basic=True)
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if not isinstance(token, str) or not token:
            raise ForwardRunError("Freqtrade login returned no access token")
        self.token = token

    def get(self, path: str) -> Any:
        return self._request(path)


def _fetch_trades(client: FreqtradeClient) -> list[dict[str, Any]]:
    trades: list[dict[str, Any]] = []
    offset = 0
    for _ in range(100):
        payload = client.get(f"trades?limit=500&offset={offset}&order_by_id=true")
        if not isinstance(payload, dict) or not isinstance(payload.get("trades"), list):
            raise ForwardRunError("Freqtrade trades response has an invalid schema")
        page = payload["trades"]
        trades.extend(item for item in page if isinstance(item, dict))
        total = payload.get("total_trades")
        if not isinstance(total, int) or len(trades) >= total or not page:
            break
        offset += len(page)
    else:
        raise ForwardRunError("Freqtrade trades pagination exceeded 50,000 records")
    return [{key: trade.get(key) for key in TRADE_FIELDS} for trade in trades]


def _next_sequence(path: Path) -> int:
    if not path.exists():
        return 1
    with path.open(encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip()) + 1


def collect_sample(
    run_dir: Path,
    config_path: Path,
    *,
    base_url: str = "http://127.0.0.1:8080",
    timeout: float = 10.0,
    now: datetime | None = None,
) -> tuple[dict[str, Any], bool]:
    """Append one credential-free runtime observation."""
    manifest = read_json(run_dir / "manifest.json")
    config = _runtime_config(config_path)
    api = config["api_server"]
    observed = now or _utc_now()
    started = time.monotonic()
    sample: dict[str, Any] = {
        "schema_version": 1,
        "sequence": _next_sequence(run_dir / "observations.jsonl"),
        "observed_at": _iso(observed),
        "observed_timestamp_ms": int(observed.timestamp() * 1000),
        "slot": max(
            0,
            int(
                (int(observed.timestamp() * 1000) - manifest["started_timestamp_ms"])
                / (manifest["sample_interval_seconds"] * 1000)
            ),
        ),
        "request_ok": False,
    }
    try:
        client = FreqtradeClient(
            base_url,
            str(api["username"]),
            str(api["password"]),
            timeout=timeout,
        )
        client.login()
        health = client.get("health")
        show_config = client.get("show_config")
        profit = client.get("profit")
        trades = _fetch_trades(client)
        valid_objects = all(isinstance(value, dict) for value in (health, show_config, profit))
        if not valid_objects:
            raise ForwardRunError("Freqtrade API returned an invalid object")
        sample.update(
            {
                "request_ok": True,
                "state": str(show_config.get("state", "unknown")).lower(),
                "health": {"status": str(health.get("status", "unknown"))},
                "profit": {key: profit.get(key) for key in PROFIT_FIELDS},
                "trades": trades,
            }
        )
    except urllib.error.HTTPError as exc:
        sample["error_code"] = f"http_{exc.code}"
    except (urllib.error.URLError, TimeoutError):
        sample["error_code"] = "network_error"
    except (json.JSONDecodeError, KeyError, TypeError, ForwardRunError):
        sample["error_code"] = "invalid_response"
    sample["latency_ms"] = round((time.monotonic() - started) * 1000, 3)
    _append_jsonl(run_dir / "observations.jsonl", sample)
    return sample, bool(sample["request_ok"])


def _load_jsonl(path: Path) -> tuple[list[dict[str, Any]], bool]:
    if not path.exists():
        return [], True
    records: list[dict[str, Any]] = []
    valid = True
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                valid = False
                continue
            if not isinstance(item, dict) or item.get("sequence") != line_number:
                valid = False
                continue
            records.append(item)
    timestamps = [item.get("observed_timestamp_ms") for item in records]
    if any(not isinstance(value, int) for value in timestamps):
        valid = False
    elif timestamps != sorted(timestamps):
        valid = False
    return records, valid


def _trade_profit(trade: dict[str, Any]) -> float | None:
    for key in ("close_profit_abs", "profit_abs"):
        value = trade.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return None


def _closed_forward_trades(
    observations: list[dict[str, Any]], started_timestamp_ms: int
) -> list[dict[str, Any]]:
    successful = [item for item in observations if item.get("request_ok") is True]
    if not successful:
        return []
    trades = successful[-1].get("trades")
    if not isinstance(trades, list):
        return []
    result: list[dict[str, Any]] = []
    for trade in trades:
        if not isinstance(trade, dict) or trade.get("is_open") is not False:
            continue
        opened = trade.get("open_timestamp")
        if not isinstance(opened, int) or opened < started_timestamp_ms:
            continue
        if _trade_profit(trade) is None:
            continue
        result.append(trade)
    return sorted(
        result,
        key=lambda trade: (trade.get("close_timestamp") or 0, trade.get("trade_id") or 0),
    )


def _max_drawdown(profits: list[float], starting_balance: float) -> float:
    balance = starting_balance
    peak = starting_balance
    maximum = 0.0
    for profit in profits:
        balance += profit
        peak = max(peak, balance)
        if peak > 0:
            maximum = max(maximum, (peak - balance) / peak)
    return maximum


def _max_consecutive_losses(profits: list[float]) -> int:
    maximum = current = 0
    for profit in profits:
        current = current + 1 if profit < 0 else 0
        maximum = max(maximum, current)
    return maximum


def _fill_deviation(trades: list[dict[str, Any]]) -> float | None:
    deviations: list[float] = []
    for trade in trades:
        for requested_key, actual_key in (
            ("open_rate_requested", "open_rate"),
            ("close_rate_requested", "close_rate"),
        ):
            requested = trade.get(requested_key)
            actual = trade.get(actual_key)
            if (
                isinstance(requested, (int, float))
                and not isinstance(requested, bool)
                and isinstance(actual, (int, float))
                and not isinstance(actual, bool)
                and requested > 0
            ):
                deviations.append(abs(float(actual) - float(requested)) / float(requested))
    return max(deviations) if deviations else None


def _signal_divergence(run_dir: Path) -> tuple[float | None, str | None]:
    path = run_dir / "signal-audit.json"
    if not path.exists():
        return None, None
    document = read_json(path)
    expected = document.get("expected_signal_count")
    matched = document.get("matched_signal_count")
    unexpected = document.get("unexpected_runtime_signal_count")
    invalid_counts = any(
        isinstance(value, bool) or not isinstance(value, int) or value < 0
        for value in (expected, matched, unexpected)
    )
    if invalid_counts:
        raise ForwardRunError("Signal audit counts must be non-negative integers")
    if matched > expected:
        raise ForwardRunError("matched_signal_count cannot exceed expected_signal_count")
    denominator = max(expected, 1)
    return (expected - matched + unexpected) / denominator, _sha256(path)


def record_restart_check(
    run_dir: Path,
    *,
    before_state: str,
    after_state: str,
    before_trade_count: int,
    after_trade_count: int,
    downtime_seconds: float,
    now: datetime | None = None,
) -> dict[str, Any]:
    if min(before_trade_count, after_trade_count) < 0 or downtime_seconds < 0:
        raise ForwardRunError("Restart evidence values must be non-negative")
    passed = (
        before_state.lower() == "running"
        and after_state.lower() == "running"
        and after_trade_count >= before_trade_count
    )
    path = run_dir / "checks.jsonl"
    moment = now or _utc_now()
    document = {
        "schema_version": 1,
        "sequence": _next_sequence(path),
        "observed_at": _iso(moment),
        "observed_timestamp_ms": int(moment.timestamp() * 1000),
        "kind": "restart_recovery",
        "passed": passed,
        "before_state": before_state.lower(),
        "after_state": after_state.lower(),
        "before_trade_count": before_trade_count,
        "after_trade_count": after_trade_count,
        "downtime_seconds": round(downtime_seconds, 3),
        "data_preserved": after_trade_count >= before_trade_count,
    }
    _append_jsonl(path, document)
    return document


def write_signal_audit(
    run_dir: Path,
    *,
    expected: int,
    matched: int,
    unexpected: int,
    source_snapshot_sha256: str,
) -> dict[str, Any]:
    if min(expected, matched, unexpected) < 0 or matched > expected:
        raise ForwardRunError("Signal audit counts are inconsistent")
    normalized_sha = source_snapshot_sha256.lower()
    invalid_sha = len(normalized_sha) != 64 or any(
        char not in "0123456789abcdef" for char in normalized_sha
    )
    if invalid_sha:
        raise ForwardRunError("source_snapshot_sha256 must be a SHA-256 hex digest")
    document = {
        "schema_version": 1,
        "recorded_at": _iso(_utc_now()),
        "expected_signal_count": expected,
        "matched_signal_count": matched,
        "missing_signal_count": expected - matched,
        "unexpected_runtime_signal_count": unexpected,
        "source_snapshot_sha256": normalized_sha,
    }
    _atomic_json(run_dir / "signal-audit.json", document)
    return document


def calculate_metrics(
    run_dir: Path,
    criteria_path: Path,
    *,
    as_of: datetime | None = None,
) -> dict[str, Any]:
    manifest = read_json(run_dir / "manifest.json")
    observations, observations_valid = _load_jsonl(run_dir / "observations.jsonl")
    checks, checks_valid = _load_jsonl(run_dir / "checks.jsonl")
    started_ms = manifest.get("started_timestamp_ms")
    interval = manifest.get("sample_interval_seconds")
    if not isinstance(started_ms, int) or not isinstance(interval, int) or interval <= 0:
        raise ForwardRunError("Run manifest has invalid timing fields")
    moment = as_of or _utc_now()
    elapsed_seconds = max(0.0, moment.timestamp() - started_ms / 1000)
    expected_samples = max(1, math.floor(elapsed_seconds / interval) + 1)
    successful_slots = {
        item.get("slot")
        for item in observations
        if item.get("request_ok") is True and isinstance(item.get("slot"), int)
    }
    successful_sample_count = min(len(successful_slots), expected_samples)
    uptime_ratio = successful_sample_count / expected_samples
    api_error_ratio = (expected_samples - successful_sample_count) / expected_samples

    trades = _closed_forward_trades(observations, started_ms)
    profits = [profit for trade in trades if (profit := _trade_profit(trade)) is not None]
    winning = sum(profit for profit in profits if profit > 0)
    losing = abs(sum(profit for profit in profits if profit < 0))
    profit_factor = winning / losing if losing else (999999.0 if winning else 0.0)
    starting_balance = float(manifest["runtime"]["dry_run_wallet"])
    pair_profit: dict[str, float] = defaultdict(float)
    for trade, profit in zip(trades, profits, strict=True):
        pair_profit[str(trade.get("pair", "unknown"))] += profit
    absolute_pair_total = sum(abs(value) for value in pair_profit.values())
    concentration = (
        max((abs(value) for value in pair_profit.values()), default=0.0) / absolute_pair_total
        if absolute_pair_total
        else 0.0
    )
    signal_divergence, signal_audit_sha = _signal_divergence(run_dir)
    restart_checks = [
        item
        for item in checks
        if item.get("kind") == "restart_recovery" and item.get("passed") is True
    ]
    criteria_integrity = manifest.get("criteria_sha256") == _sha256(criteria_path)

    return {
        "schema_version": 1,
        "run_id": manifest.get("run_id"),
        "as_of": _iso(moment),
        "observation_days": elapsed_seconds / 86400,
        "trade_count": len(trades),
        "profit_factor": profit_factor,
        "net_return_ratio": sum(profits) / starting_balance,
        "max_drawdown_ratio": _max_drawdown(profits, starting_balance),
        "single_pair_pnl_contribution_ratio": concentration,
        "max_consecutive_losses": _max_consecutive_losses(profits),
        "signal_divergence_ratio": signal_divergence,
        "fill_deviation_ratio": _fill_deviation(trades),
        "uptime_ratio": uptime_ratio,
        "api_error_ratio": api_error_ratio,
        "restart_recovery": bool(restart_checks),
        "data_integrity": observations_valid and checks_valid and criteria_integrity,
        "evidence": {
            "criteria_sha256": manifest.get("criteria_sha256"),
            "signal_audit_sha256": signal_audit_sha,
            "expected_sample_count": expected_samples,
            "successful_sample_count": successful_sample_count,
            "observation_count": len(observations),
            "restart_check_count": len(restart_checks),
            "pair_profit_abs": dict(sorted(pair_profit.items())),
        },
        "lineage": manifest.get("lineage", {}),
    }


def write_report(
    run_dir: Path,
    criteria_path: Path,
    *,
    final: bool = False,
    as_of: datetime | None = None,
) -> dict[str, Any]:
    criteria_document = read_json(criteria_path)
    criteria = validate_criteria(criteria_document)
    metrics = calculate_metrics(run_dir, criteria_path, as_of=as_of)
    raw_verdict = evaluate(metrics, criteria_document)
    evidence_missing = any(
        metrics.get(key) is None for key in ("signal_divergence_ratio", "fill_deviation_ratio")
    ) or not metrics["restart_recovery"]
    if not final and metrics["observation_days"] < criteria["min_observation_days"]:
        status = "collecting"
    elif not final and evidence_missing:
        status = "needs_iteration"
    else:
        status = raw_verdict["status"]
    verdict = {
        **raw_verdict,
        "status": status,
        "acceptance_status": raw_verdict["status"],
        "final": final,
        "generated_at": metrics["as_of"],
    }
    _atomic_json(run_dir / "metrics.json", metrics)
    _atomic_json(run_dir / "verdict.json", verdict)
    return verdict


@contextlib.contextmanager
def _exclusive_run_lock(run_dir: Path) -> Iterator[None]:
    run_dir.mkdir(parents=True, exist_ok=True)
    lock_path = run_dir / ".sample.lock"
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise ForwardRunError("Another forward-run sample is already active") from exc
    os.close(descriptor)
    try:
        yield
    finally:
        lock_path.unlink(missing_ok=True)


def _lineage_from_args(args: argparse.Namespace) -> dict[str, str]:
    return {
        "git_sha": args.git_sha,
        "strategy_sha": args.strategy_sha,
        "strategy_version": args.strategy_version,
        "freqtrade_version": args.freqtrade_version,
        "docker_image_digest": args.docker_image_digest,
        "protocol_version": args.protocol_version,
    }


def _add_init_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--criteria", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--interval-seconds", type=int, default=300)
    parser.add_argument("--git-sha", default="unknown")
    parser.add_argument("--strategy-sha", default="unknown")
    parser.add_argument("--strategy-version", default="SimpleSpot-v1")
    parser.add_argument("--freqtrade-version", default="unknown")
    parser.add_argument("--docker-image-digest", default="unknown")
    parser.add_argument("--protocol-version", default="1")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    init_parser = commands.add_parser("init", help="Freeze a new run manifest")
    _add_init_arguments(init_parser)
    sample_parser = commands.add_parser("sample", help="Collect one runtime sample")
    _add_init_arguments(sample_parser)
    sample_parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    sample_parser.add_argument("--timeout", type=float, default=10.0)
    report_parser = commands.add_parser("report", help="Write metrics and verdict documents")
    report_parser.add_argument("--run-dir", type=Path, required=True)
    report_parser.add_argument("--criteria", type=Path, required=True)
    report_parser.add_argument("--final", action="store_true")
    restart_parser = commands.add_parser("record-restart", help="Record observed restart recovery")
    restart_parser.add_argument("--run-dir", type=Path, required=True)
    restart_parser.add_argument("--before-state", required=True)
    restart_parser.add_argument("--after-state", required=True)
    restart_parser.add_argument("--before-trade-count", type=int, required=True)
    restart_parser.add_argument("--after-trade-count", type=int, required=True)
    restart_parser.add_argument("--downtime-seconds", type=float, required=True)
    signal_parser = commands.add_parser(
        "record-signal-audit", help="Record replay/runtime signal matching"
    )
    signal_parser.add_argument("--run-dir", type=Path, required=True)
    signal_parser.add_argument("--expected", type=int, required=True)
    signal_parser.add_argument("--matched", type=int, required=True)
    signal_parser.add_argument("--unexpected", type=int, required=True)
    signal_parser.add_argument("--source-snapshot-sha256", required=True)
    args = parser.parse_args()

    try:
        if args.command in {"init", "sample"}:
            with _exclusive_run_lock(args.run_dir):
                initialize_run(
                    args.run_dir,
                    args.criteria,
                    args.config,
                    run_id=args.run_id,
                    interval_seconds=args.interval_seconds,
                    lineage=_lineage_from_args(args),
                )
                if args.command == "init":
                    print(f"forward_run={args.run_id} status=initialized")
                    return 0
                sample, ok = collect_sample(
                    args.run_dir,
                    args.config,
                    base_url=args.base_url,
                    timeout=args.timeout,
                )
                verdict = write_report(args.run_dir, args.criteria)
                print(
                    f"forward_run={args.run_id} sample={sample['sequence']} "
                    f"request_ok={str(ok).lower()} status={verdict['status']}"
                )
                return 0 if ok else 1
        if args.command == "report":
            verdict = write_report(args.run_dir, args.criteria, final=args.final)
            print(json.dumps(verdict, indent=2, sort_keys=True, allow_nan=False))
            if args.final:
                return 0 if verdict["status"] == "passed" else 2
            return 0
        if args.command == "record-restart":
            result = record_restart_check(
                args.run_dir,
                before_state=args.before_state,
                after_state=args.after_state,
                before_trade_count=args.before_trade_count,
                after_trade_count=args.after_trade_count,
                downtime_seconds=args.downtime_seconds,
            )
            print(json.dumps(result, indent=2, sort_keys=True))
            return 0 if result["passed"] else 2
        if args.command == "record-signal-audit":
            result = write_signal_audit(
                args.run_dir,
                expected=args.expected,
                matched=args.matched,
                unexpected=args.unexpected,
                source_snapshot_sha256=args.source_snapshot_sha256,
            )
            print(json.dumps(result, indent=2, sort_keys=True))
            return 0
    except (AcceptanceError, ForwardRunError, OSError, json.JSONDecodeError) as exc:
        print(f"forward-run error: {exc}", file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
