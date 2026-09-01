#!/usr/bin/env python3
"""Reproducible validation runner for the SimpleSpot research strategy."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zipfile import ZipFile


try:
    from strategy_validation.diagnostics import (
        DiagnosticsError,
        load_and_analyze,
        summarize_backtest_archive,
        timeframe_to_minutes,
    )
except ModuleNotFoundError:  # pragma: no cover - supports direct script execution
    from diagnostics import (  # type: ignore[no-redef]
        DiagnosticsError,
        load_and_analyze,
        summarize_backtest_archive,
        timeframe_to_minutes,
    )


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
PROTOCOL_PATH = HERE / "protocol.json"
CONFIG_PATH = HERE / "freqtrade.validation.json"
DATA_ROOT = HERE / "data"
DATA_LOCK_PATH = HERE / "dataset-lock.json"
OUTPUT_ROOT = HERE / "output"
STRATEGY_PATH = REPO_ROOT / "user_data" / "strategies" / "SimpleSpot.py"
RUNTIME_TEMPLATE_PATH = REPO_ROOT / "user_data" / "config.binance.example.json"
ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
TIMERANGE_RE = re.compile(r"^(\d{8})-(\d{8})$")


class PipelineError(RuntimeError):
    """Raised when the validation protocol or an analysis result is invalid."""


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_timerange(value: str) -> tuple[datetime, datetime]:
    match = TIMERANGE_RE.fullmatch(value)
    if not match:
        raise PipelineError(f"Invalid absolute timerange: {value}")
    start = datetime.strptime(match.group(1), "%Y%m%d")
    end = datetime.strptime(match.group(2), "%Y%m%d")
    if start >= end:
        raise PipelineError(f"Timerange start must precede end: {value}")
    return start, end


# The protocol guard is intentionally exhaustive.
def validate_protocol(protocol: dict[str, Any]) -> None:  # noqa: C901
    expected_pairs = ["BTC/USDT", "ETH/USDT", "XRP/USDT"]
    expected_scalars = {
        "schema_version": 1,
        "strategy": "SimpleSpot",
        "exchange": "binance",
        "trading_mode": "spot",
        "timeframe": "5m",
    }
    for key, expected in expected_scalars.items():
        if protocol.get(key) != expected:
            raise PipelineError(f"Protocol {key!r} must be {expected!r}")
    if protocol.get("pairs") != expected_pairs:
        raise PipelineError(f"Protocol pairs must remain fixed to {expected_pairs}")

    fee = protocol.get("fee_ratio")
    if not isinstance(fee, (int, float)) or not 0 < fee <= 0.01:
        raise PipelineError("fee_ratio must be a positive per-side ratio no greater than 1%")
    balance = protocol.get("starting_balance")
    if not isinstance(balance, (int, float)) or balance <= 0:
        raise PipelineError("starting_balance must be positive")

    phases = protocol.get("phases")
    if not isinstance(phases, list) or len(phases) != 3:
        raise PipelineError("Protocol must define exactly three validation phases")
    roles = [phase.get("role") for phase in phases]
    if roles != ["development", "validation", "holdout"]:
        raise PipelineError("Phases must be ordered development, validation, holdout")
    ids = [phase.get("id") for phase in phases]
    if len(set(ids)) != len(ids) or any(not isinstance(item, str) for item in ids):
        raise PipelineError("Phase ids must be unique strings")

    previous_end: datetime | None = None
    for phase in phases:
        data_start, data_end = parse_timerange(phase["download_timerange"])
        test_start, test_end = parse_timerange(phase["timerange"])
        if data_start > test_start or data_end < test_end:
            raise PipelineError(f"Data window does not cover phase {phase['id']}")
        if previous_end is not None and test_start < previous_end:
            raise PipelineError("Validation phase timeranges must not overlap")
        previous_end = test_end
    if phases[-1].get("sealed") is not True:
        raise PipelineError("The holdout phase must remain sealed")

    phase_by_id = {phase["id"]: phase for phase in phases}
    lookahead = protocol.get("lookahead", {})
    if phase_by_id.get(lookahead.get("phase"), {}).get("role") != "holdout":
        raise PipelineError("Lookahead analysis must use the holdout phase")
    if lookahead.get("minimum_trade_amount", 0) < 5:
        raise PipelineError("Lookahead analysis must inspect at least five signals")
    if lookahead.get("targeted_trade_amount", 0) < lookahead["minimum_trade_amount"]:
        raise PipelineError("Lookahead targeted trades cannot be lower than the minimum")

    recursive = protocol.get("recursive", {})
    if phase_by_id.get(recursive.get("phase"), {}).get("role") != "holdout":
        raise PipelineError("Recursive analysis must use the holdout phase")
    if recursive.get("pair") not in expected_pairs:
        raise PipelineError("Recursive analysis pair must belong to the fixed universe")
    if recursive.get("strategy_startup_candle") != 200:
        raise PipelineError("Protocol must verify SimpleSpot startup_candle_count=200")
    startup_candles = recursive.get("startup_candles", [])
    if not startup_candles or any(
        not isinstance(value, int) or value <= 0 for value in startup_candles
    ):
        raise PipelineError("Recursive startup candles must be positive integers")
    threshold = recursive.get("max_abs_variance_pct_at_strategy_startup")
    if not isinstance(threshold, (int, float)) or threshold < 0:
        raise PipelineError("Recursive variance threshold must be non-negative")

    validation_config = read_json(CONFIG_PATH)
    runtime_template = read_json(RUNTIME_TEMPLATE_PATH)
    expected_ccxt_config = {
        "urls": {"api": {"public": "https://data-api.binance.vision/api/v3"}},
        "options": {"fetchMarkets": {"types": ["spot"]}},
    }
    expected_ccxt_async_config = {
        "urls": {
            "api": {
                "public": "https://data-api.binance.vision/api/v3",
                "ws": {"spot": "wss://data-stream.binance.vision/ws"},
            }
        },
        "options": {"fetchMarkets": {"types": ["spot"]}},
    }
    for label, config in (
        ("validation config", validation_config),
        ("runtime template", runtime_template),
    ):
        if config.get("dry_run") is not True:
            raise PipelineError(f"{label} must keep dry_run enabled")
        if config.get("exchange", {}).get("name") != protocol["exchange"]:
            raise PipelineError(f"{label} exchange differs from protocol")
        if config.get("trading_mode") != protocol["trading_mode"]:
            raise PipelineError(f"{label} must remain spot-only")
        if config.get("margin_mode") != "":
            raise PipelineError(f"{label} must not enable a margin mode")
        if config.get("force_entry_enable") is not False:
            raise PipelineError(f"{label} must keep manual force-entry disabled")
        exchange = config.get("exchange", {})
        if exchange.get("pair_whitelist") != expected_pairs:
            raise PipelineError(f"{label} does not match the fixed protocol pairs")
        if exchange.get("ccxt_config") != expected_ccxt_config:
            raise PipelineError(
                f"{label} ccxt_config must use Binance global's public "
                "market-data endpoint and spot-only discovery"
            )
        if exchange.get("ccxt_async_config") != expected_ccxt_async_config:
            raise PipelineError(
                f"{label} ccxt_async_config must use Binance global's public "
                "market-data REST/WebSocket endpoints and spot-only discovery"
            )
        if config.get("pairlists") != [{"method": "StaticPairList"}]:
            raise PipelineError(f"{label} must use only StaticPairList")
    if validation_config.get("timeframe") != protocol["timeframe"]:
        raise PipelineError("Validation config timeframe differs from protocol")
    if validation_config.get("dry_run_wallet") != protocol["starting_balance"]:
        raise PipelineError("Validation wallet differs from protocol")

    source = STRATEGY_PATH.read_text(encoding="utf-8")
    compile(source, str(STRATEGY_PATH), "exec")
    startup_match = re.search(r"^\s*startup_candle_count\s*=\s*(\d+)\s*$", source, re.MULTILINE)
    if not startup_match or int(startup_match.group(1)) != recursive["strategy_startup_candle"]:
        raise PipelineError("SimpleSpot startup_candle_count differs from protocol")


def expected_data_names(protocol: dict[str, Any]) -> set[str]:
    expected: set[str] = set()
    for phase in protocol["phases"]:
        for pair in protocol["pairs"]:
            pair_name = pair.replace("/", "_").replace(":", "_")
            expected.add(f"data/{phase['id']}/{pair_name}-{protocol['timeframe']}.json.gz")
    return expected


def build_data_lock(source_run: str, freqtrade_version: str) -> dict[str, Any]:
    protocol = read_json(PROTOCOL_PATH)
    validate_protocol(protocol)
    files = sorted(path for path in DATA_ROOT.rglob("*.json.gz") if path.is_file())
    entries = [
        {
            "path": path.relative_to(HERE).as_posix(),
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
        }
        for path in files
    ]
    actual_names = {entry["path"] for entry in entries}
    expected_names = expected_data_names(protocol)
    if actual_names != expected_names:
        missing = sorted(expected_names - actual_names)
        unexpected = sorted(actual_names - expected_names)
        raise PipelineError(f"Dataset shape mismatch; missing={missing}, unexpected={unexpected}")
    return {
        "schema_version": 1,
        "source": {
            "exchange": protocol["exchange"],
            "source_run": source_run,
            "freqtrade_version": freqtrade_version,
            "locked_at_utc": datetime.now(UTC).isoformat(),
        },
        "files": entries,
    }


def verify_data_lock(protocol: dict[str, Any]) -> dict[str, Any]:
    if not DATA_LOCK_PATH.is_file():
        raise PipelineError("Missing strategy_validation/dataset-lock.json")
    lock = read_json(DATA_LOCK_PATH)
    if lock.get("schema_version") != 1:
        raise PipelineError("Unsupported dataset lock schema")
    entries = lock.get("files")
    if not isinstance(entries, list):
        raise PipelineError("Dataset lock has no file entries")
    locked_names = {entry.get("path") for entry in entries}
    if locked_names != expected_data_names(protocol):
        raise PipelineError("Dataset lock does not match the protocol phase/pair matrix")
    for entry in entries:
        path = HERE / entry["path"]
        if not path.is_file():
            raise PipelineError(f"Locked dataset file is missing: {entry['path']}")
        if path.stat().st_size != entry["bytes"]:
            raise PipelineError(f"Dataset size mismatch: {entry['path']}")
        if sha256_file(path) != entry["sha256"]:
            raise PipelineError(f"Dataset checksum mismatch: {entry['path']}")
    actual_names = {
        path.relative_to(HERE).as_posix()
        for path in DATA_ROOT.rglob("*.json.gz")
        if path.is_file()
    }
    if actual_names != locked_names:
        raise PipelineError("Dataset contains untracked or missing candle files")
    return lock


def run_command(command: list[str], log_path: Path) -> str:
    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    output = result.stdout or ""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(output, encoding="utf-8")
    console_encoding = sys.stdout.encoding or "utf-8"
    console_output = output.encode(console_encoding, errors="backslashreplace").decode(
        console_encoding
    )
    print(console_output, end="")
    if result.returncode != 0:
        tail = "\n".join(output.splitlines()[-40:])
        raise PipelineError(f"Command failed ({result.returncode}): {' '.join(command)}\n{tail}")
    return output


def load_backtest_payload(zip_path: Path) -> dict[str, Any]:
    with ZipFile(zip_path) as archive:
        for name in archive.namelist():
            if not name.endswith(".json") or name.endswith("_config.json"):
                continue
            payload = json.loads(archive.read(name))
            if "strategy" in payload:
                return payload
    raise PipelineError(f"No strategy result JSON found in {zip_path.name}")


def summarize_backtest(zip_path: Path, strategy: str, phase: dict[str, Any]) -> dict[str, Any]:
    payload = load_backtest_payload(zip_path)
    if strategy not in payload.get("strategy", {}):
        raise PipelineError(f"Backtest archive does not contain strategy {strategy}")
    stats = payload["strategy"][strategy]
    keys = (
        "total_trades",
        "wins",
        "draws",
        "losses",
        "profit_factor",
        "max_drawdown_account",
        "sharpe",
        "sortino",
        "market_change",
        "backtest_start",
        "backtest_end",
    )
    result = {key: stats.get(key) for key in keys}
    profit_total_pct = stats.get("profit_total_pct")
    if profit_total_pct is None and stats.get("profit_total") is not None:
        profit_total_pct = float(stats["profit_total"]) * 100
    result["profit_total_pct"] = profit_total_pct
    result.update(
        {
            "id": phase["id"],
            "role": phase["role"],
            "timerange": phase["timerange"],
            "archive": zip_path.name,
        }
    )
    return result


def parse_lookahead(csv_path: Path, strategy: str, minimum_signals: int) -> dict[str, Any]:
    if not csv_path.is_file():
        raise PipelineError("Lookahead analysis did not produce its CSV result")
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    row = next((item for item in rows if item.get("strategy") == strategy), None)
    if row is None:
        raise PipelineError("Lookahead CSV does not contain SimpleSpot")
    has_bias = str(row.get("has_bias", "")).strip().lower() in {"true", "yes", "1"}
    total_signals = int(row.get("total_signals") or 0)
    result = {
        "has_bias": has_bias,
        "total_signals": total_signals,
        "biased_entry_signals": int(row.get("biased_entry_signals") or 0),
        "biased_exit_signals": int(row.get("biased_exit_signals") or 0),
        "biased_indicators": [
            value for value in str(row.get("biased_indicators") or "").split(",") if value
        ],
    }
    if total_signals < minimum_signals:
        raise PipelineError(
            f"Lookahead analysis checked only {total_signals} signals; minimum is {minimum_signals}"
        )
    if has_bias:
        raise PipelineError(f"Lookahead bias detected: {result}")
    return result


# The parser validates several terminal output formats.
def parse_recursive_output(  # noqa: C901
    output: str, strategy_startup: int, max_variance_pct: float
) -> dict[str, Any]:
    clean = ANSI_RE.sub("", output)
    if "No variance on indicator(s) found due to recursive formula" in clean:
        return {
            "status": "no_variance",
            "strategy_startup_candle": strategy_startup,
            "max_abs_variance_pct": 0.0,
            "indicators": [],
        }

    rows: list[list[str]] = []
    headers: list[str] | None = None
    for line in clean.splitlines():
        if "│" not in line and "┃" not in line:
            continue
        cells = [cell.strip() for cell in re.split(r"[│┃]", line) if cell.strip()]
        if not cells:
            continue
        if cells[0].lower() == "indicators":
            headers = cells
            continue
        if headers and len(cells) == len(headers):
            rows.append(cells)
    if not headers or not rows:
        raise PipelineError("Could not parse recursive-analysis result table")

    target_index = next(
        (
            index
            for index, header in enumerate(headers)
            if re.match(rf"^{strategy_startup}(?:\D|$)", header)
        ),
        None,
    )
    if target_index is None:
        raise PipelineError(f"Recursive table has no startup candle {strategy_startup} column")

    indicators: list[dict[str, Any]] = []
    numeric_values: list[float] = []
    for row in rows:
        raw = row[target_index]
        if raw in {"-", "nan%", "nan"}:
            value: float | None = None
        else:
            try:
                value = float(raw.rstrip("%"))
            except ValueError as exc:
                raise PipelineError(f"Invalid recursive variance value {raw!r}") from exc
            numeric_values.append(abs(value))
        indicators.append({"indicator": row[0], "variance_pct": value})

    max_variance = max(numeric_values, default=0.0)
    result = {
        "status": "parsed",
        "strategy_startup_candle": strategy_startup,
        "max_abs_variance_pct": max_variance,
        "threshold_pct": max_variance_pct,
        "indicators": indicators,
    }
    if max_variance > max_variance_pct:
        raise PipelineError(
            f"Recursive variance {max_variance}% exceeds threshold {max_variance_pct}%"
        )
    return result


def build_candle_diagnostics(protocol: dict[str, Any]) -> list[dict[str, Any]]:
    """Build per-phase/per-pair diagnostics from the locked candle snapshots."""

    timeframe_minutes = timeframe_to_minutes(protocol["timeframe"])
    phases: list[dict[str, Any]] = []
    for phase in protocol["phases"]:
        pair_reports: list[dict[str, Any]] = []
        for pair in protocol["pairs"]:
            pair_name = pair.replace("/", "_").replace(":", "_")
            path = DATA_ROOT / phase["id"] / f"{pair_name}-{protocol['timeframe']}.json.gz"
            try:
                pair_reports.append(
                    load_and_analyze(
                        path,
                        pair,
                        timeframe_minutes=timeframe_minutes,
                        fee_ratio=protocol["fee_ratio"],
                    )
                )
            except DiagnosticsError as exc:
                raise PipelineError(f"Diagnostics failed for {phase['id']} {pair}: {exc}") from exc
        phases.append(
            {
                "id": phase["id"],
                "role": phase["role"],
                "timerange": phase["timerange"],
                "pairs": pair_reports,
            }
        )
    return phases


def phase_by_id(protocol: dict[str, Any], phase_id: str) -> dict[str, Any]:
    return next(phase for phase in protocol["phases"] if phase["id"] == phase_id)


def render_markdown(report: dict[str, Any]) -> str:
    protocol = report["protocol"]
    lines = [
        "# SimpleSpot strategy validation report",
        "",
        f"Generated: `{report['generated_at_utc']}`",
        f"Freqtrade: `{report['freqtrade_version']}`",
        f"Dataset lock SHA-256: `{report['dataset']['lock_sha256']}`",
        "",
        "> Research evidence only. This report does not approve real-money trading.",
        "",
        "## Protocol",
        "",
        f"- Fixed universe: {', '.join(protocol['pairs'])}",
        f"- Timeframe: `{protocol['timeframe']}`",
        f"- Fee: `{protocol['fee_ratio']:.4f}` per side",
        f"- Starting balance: `{protocol['starting_balance']} USDT`",
        "- Hyperopt: deliberately excluded",
        "",
        "## Backtest windows",
        "",
        "| Window | Role | Timerange | Trades | Return | Max drawdown | Profit factor | Sharpe |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for phase in report["backtests"]:
        drawdown = phase.get("max_drawdown_account")
        drawdown_pct = None if drawdown is None else drawdown * 100
        lines.append(
            "| {id} | {role} | `{timerange}` | {trades} | {profit:.2f}% | "
            "{drawdown} | {factor} | {sharpe} |".format(
                id=phase["id"],
                role=phase["role"],
                timerange=phase["timerange"],
                trades=phase.get("total_trades", "-"),
                profit=float(phase.get("profit_total_pct") or 0),
                drawdown="-" if drawdown_pct is None else f"{drawdown_pct:.2f}%",
                factor=phase.get("profit_factor", "-"),
                sharpe=phase.get("sharpe", "-"),
            )
        )
    lines.extend(
        [
            "",
            "## Signal diagnostics",
            "",
            (
                "Signal counts reproduce SimpleSpot's RSI/EMA conditions; forward metrics use only "
                "candles after each entry."
            ),
            "",
            (
                "| Window | Pair | Rows | RSI >30 crosses | EMA filtered | Entries | "
                "Entry frequency | 24h net mean | 24h MFE | 24h MAE |"
            ),
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for phase in report.get("diagnostics", []):
        for pair_report in phase["pairs"]:
            signals = pair_report["signals"]
            forward_24h = pair_report["forward_return_net"].get("24h", {})
            rows = pair_report["rows"]
            frequency = signals["entry_signals"] / rows if rows else 0
            lines.append(
                "| {window} | {pair} | {rows} | {crosses} | {filtered} | {entries} | "
                "{frequency:.4%} | "
                "{return_mean} | {mfe} | {mae} |".format(
                    window=phase["id"],
                    pair=pair_report["pair"],
                    rows=rows,
                    crosses=signals["rsi_crosses_above_30"],
                    filtered=signals["ema_filtered_candidates"],
                    entries=signals["entry_signals"],
                    frequency=frequency,
                    return_mean="-"
                    if forward_24h.get("mean") is None
                    else f"{forward_24h['mean']:.2%}",
                    mfe="-"
                    if pair_report["mfe_24h"].get("mean") is None
                    else f"{pair_report['mfe_24h']['mean']:.2%}",
                    mae="-"
                    if pair_report["mae_24h"].get("mean") is None
                    else f"{pair_report['mae_24h']['mean']:.2%}",
                )
            )
    lines.extend(
        [
            "",
            "### Backtest exit reasons",
            "",
            "| Window | Exit reason | Trades |",
            "| --- | --- | ---: |",
        ]
    )
    for phase in report.get("diagnostics", []):
        for reason, count in phase.get("backtest", {}).get("exit_reasons", {}).items():
            lines.append(f"| {phase['id']} | `{reason}` | {count} |")

    lookahead = report["lookahead"]
    recursive = report["recursive"]
    lines.extend(
        [
            "",
            "## Bias and recursion checks",
            "",
            (
                f"- Lookahead bias: **{'detected' if lookahead['has_bias'] else 'not detected'}** "
                f"across {lookahead['total_signals']} checked signals."
            ),
            (
                f"- Recursive analysis: `{recursive['status']}`; maximum absolute variance at "
                f"startup candle {recursive['strategy_startup_candle']} was "
                f"`{recursive['max_abs_variance_pct']:.6f}%`."
            ),
            "",
            "## Dataset integrity",
            "",
            f"- Files: `{report['dataset']['file_count']}`",
            f"- Compressed bytes: `{report['dataset']['total_bytes']}`",
            f"- Source run: {report['dataset']['source_run']}",
            "",
            "## Interpretation guardrails",
            "",
            (
                "- Negative or weak returns are recorded, not hidden and not treated as a pipeline "
                "failure."
            ),
            (
                "- The holdout window is sealed; future parameter changes must be judged without "
                "tuning to it."
            ),
            (
                "- Passing this pipeline is necessary but not sufficient; long-term dry-run "
                "evidence is still required."
            ),
            "",
        ]
    )
    return "\n".join(lines)


def execute(freqtrade: str) -> dict[str, Any]:
    protocol = read_json(PROTOCOL_PATH)
    validate_protocol(protocol)
    lock = verify_data_lock(protocol)
    diagnostics = build_candle_diagnostics(protocol)
    diagnostics_by_phase = {phase["id"]: phase for phase in diagnostics}

    if OUTPUT_ROOT.parent != HERE or OUTPUT_ROOT.name != "output":
        raise PipelineError("Refusing to clean an unexpected output directory")
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    backtest_dir = OUTPUT_ROOT / "raw" / "backtests"
    log_dir = OUTPUT_ROOT / "raw" / "logs"
    backtest_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    version_output = run_command([freqtrade, "--version"], log_dir / "version.log")
    freqtrade_version = next(
        (line.strip() for line in version_output.splitlines() if "Freqtrade Version:" in line),
        version_output.strip().splitlines()[-1],
    )

    common = [
        "--config",
        str(CONFIG_PATH),
        "--strategy",
        protocol["strategy"],
        "--strategy-path",
        str(STRATEGY_PATH.parent),
        "--data-format-ohlcv",
        "jsongz",
        "--fee",
        str(protocol["fee_ratio"]),
        "--pairs",
        *protocol["pairs"],
        "--no-color",
    ]

    backtests: list[dict[str, Any]] = []
    for phase in protocol["phases"]:
        before = set(backtest_dir.glob("*.zip"))
        command = [
            freqtrade,
            "backtesting",
            *common,
            "--datadir",
            str(DATA_ROOT / phase["id"]),
            "--timerange",
            phase["timerange"],
            "--dry-run-wallet",
            str(protocol["starting_balance"]),
            "--cache",
            "none",
            "--export",
            "trades",
            "--backtest-directory",
            str(backtest_dir),
            "--backtest-filename",
            f"{phase['id']}.json",
        ]
        run_command(command, log_dir / f"backtest-{phase['id']}.log")
        created = sorted(
            set(backtest_dir.glob("*.zip")) - before,
            key=lambda path: path.stat().st_mtime,
        )
        if len(created) != 1:
            raise PipelineError(f"Expected one backtest archive for {phase['id']}, got {created}")
        backtest_summary = summarize_backtest(created[0], protocol["strategy"], phase)
        backtests.append(backtest_summary)
        try:
            diagnostics_by_phase[phase["id"]]["backtest"] = summarize_backtest_archive(
                created[0], protocol["strategy"]
            )
        except DiagnosticsError as exc:
            raise PipelineError(f"Backtest diagnostics failed for {phase['id']}: {exc}") from exc

    lookahead_spec = protocol["lookahead"]
    lookahead_phase = phase_by_id(protocol, lookahead_spec["phase"])
    lookahead_csv = OUTPUT_ROOT / "raw" / "lookahead.csv"
    run_command(
        [
            freqtrade,
            "lookahead-analysis",
            *common,
            "--datadir",
            str(DATA_ROOT / lookahead_phase["id"]),
            "--timerange",
            lookahead_phase["timerange"],
            "--minimum-trade-amount",
            str(lookahead_spec["minimum_trade_amount"]),
            "--targeted-trade-amount",
            str(lookahead_spec["targeted_trade_amount"]),
            "--lookahead-analysis-exportfilename",
            str(lookahead_csv),
        ],
        log_dir / "lookahead.log",
    )
    lookahead = parse_lookahead(
        lookahead_csv, protocol["strategy"], lookahead_spec["minimum_trade_amount"]
    )

    recursive_spec = protocol["recursive"]
    recursive_phase = phase_by_id(protocol, recursive_spec["phase"])
    recursive_output = run_command(
        [
            freqtrade,
            "recursive-analysis",
            "--config",
            str(CONFIG_PATH),
            "--strategy",
            protocol["strategy"],
            "--strategy-path",
            str(STRATEGY_PATH.parent),
            "--data-format-ohlcv",
            "jsongz",
            "--datadir",
            str(DATA_ROOT / recursive_phase["id"]),
            "--timerange",
            recursive_phase["download_timerange"],
            "--pairs",
            recursive_spec["pair"],
            "--startup-candle",
            *[str(value) for value in recursive_spec["startup_candles"]],
            "--no-color",
        ],
        log_dir / "recursive.log",
    )
    recursive = parse_recursive_output(
        recursive_output,
        recursive_spec["strategy_startup_candle"],
        recursive_spec["max_abs_variance_pct_at_strategy_startup"],
    )

    lock_bytes = DATA_LOCK_PATH.read_bytes()
    report = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "status": "passed",
        "freqtrade_version": freqtrade_version,
        "protocol": protocol,
        "dataset": {
            "lock_sha256": hashlib.sha256(lock_bytes).hexdigest(),
            "file_count": len(lock["files"]),
            "total_bytes": sum(entry["bytes"] for entry in lock["files"]),
            "source_run": lock["source"]["source_run"],
        },
        "backtests": backtests,
        "diagnostics": diagnostics,
        "lookahead": lookahead,
        "recursive": recursive,
    }
    (OUTPUT_ROOT / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (OUTPUT_ROOT / "report.md").write_text(render_markdown(report), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate", help="Validate protocol and config")
    validate_parser.add_argument("--require-data", action="store_true")
    lock_parser = subparsers.add_parser("lock-data", help="Create dataset-lock.json")
    lock_parser.add_argument("--source-run", required=True)
    lock_parser.add_argument("--freqtrade-version", required=True)
    run_parser = subparsers.add_parser("run", help="Run the complete strategy validation")
    run_parser.add_argument("--freqtrade", default="freqtrade")
    args = parser.parse_args()

    try:
        protocol = read_json(PROTOCOL_PATH)
        validate_protocol(protocol)
        if args.command == "validate":
            if args.require_data:
                verify_data_lock(protocol)
            print("Strategy validation protocol: OK")
        elif args.command == "lock-data":
            lock = build_data_lock(args.source_run, args.freqtrade_version)
            DATA_LOCK_PATH.write_text(
                json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            print(f"Wrote {DATA_LOCK_PATH.relative_to(REPO_ROOT)} with {len(lock['files'])} files")
        elif args.command == "run":
            report = execute(args.freqtrade)
            print(f"Strategy validation {report['status']}: {OUTPUT_ROOT / 'report.md'}")
    except (OSError, ValueError, KeyError, StopIteration, PipelineError) as exc:
        print(f"strategy-validation error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
