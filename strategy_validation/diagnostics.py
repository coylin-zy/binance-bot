#!/usr/bin/env python3
"""Signal and forward-return diagnostics for the frozen SimpleSpot strategy.

The diagnostic layer intentionally does not place trades and does not tune the
strategy. It reproduces the RSI/EMA entry conditions, then measures what happened
after each historical signal without using future candles for the signal itself.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zipfile import ZipFile


DEFAULT_HORIZONS = {
    "1h": 12,
    "4h": 48,
    "12h": 144,
    "24h": 288,
}
DEFAULT_TIMEFRAME_MINUTES = 5
RSI_PERIOD = 14
EMA_PERIOD = 50
REGIME_LOOKBACK_DAYS = 1
REGIME_TREND_THRESHOLD = 0.02
REGIME_HIGH_VOL_THRESHOLD = 0.80
REGIME_LOW_VOL_THRESHOLD = 0.20


class DiagnosticsError(ValueError):
    """Raised when a candle or backtest diagnostic input is invalid."""


@dataclass(frozen=True)
class Candle:
    """One Freqtrade/CCXT OHLCV row."""

    timestamp_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def timestamp(self) -> str:
        return datetime.fromtimestamp(self.timestamp_ms / 1000, UTC).isoformat()


def timeframe_to_minutes(value: str) -> int:
    """Convert a Freqtrade timeframe such as ``5m`` or ``1h`` to minutes."""

    match = re.fullmatch(r"(\d+)([mhd])", value.strip().lower())
    if not match:
        raise DiagnosticsError(f"Unsupported timeframe: {value}")
    amount = int(match.group(1))
    unit = match.group(2)
    multiplier = {"m": 1, "h": 60, "d": 24 * 60}[unit]
    minutes = amount * multiplier
    if minutes <= 0:
        raise DiagnosticsError(f"Timeframe must be positive: {value}")
    return minutes


def load_candles(path: Path) -> list[Candle]:
    """Load and validate a Freqtrade ``json.gz`` OHLCV file."""

    try:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise DiagnosticsError(f"Could not read candle file {path}: {exc}") from exc

    if not isinstance(payload, list):
        raise DiagnosticsError(f"Candle file {path} must contain a JSON array")

    candles: list[Candle] = []
    previous_timestamp: int | None = None
    for index, row in enumerate(payload):
        if not isinstance(row, list) or len(row) < 6:
            raise DiagnosticsError(f"Candle row {index} in {path} must contain six values")
        try:
            timestamp_ms = int(row[0])
            values = tuple(float(value) for value in row[1:6])
        except (TypeError, ValueError) as exc:
            raise DiagnosticsError(
                f"Candle row {index} in {path} contains invalid numbers"
            ) from exc
        if timestamp_ms <= 0 or any(not math.isfinite(value) for value in values):
            raise DiagnosticsError(f"Candle row {index} in {path} contains non-finite values")
        if (
            values[1] < values[0]
            or values[1] < values[3]
            or values[2] > values[0]
            or values[2] > values[3]
            or values[4] < 0
        ):
            raise DiagnosticsError(f"Candle row {index} in {path} has invalid OHLC bounds")
        if previous_timestamp is not None and timestamp_ms <= previous_timestamp:
            raise DiagnosticsError(f"Candle timestamps must be strictly increasing in {path}")
        previous_timestamp = timestamp_ms
        candles.append(Candle(timestamp_ms, *values))
    if not candles:
        raise DiagnosticsError(f"Candle file {path} is empty")
    return candles


def ema(values: Sequence[float], period: int) -> list[float | None]:
    """Return a TA-Lib-compatible EMA seeded with the first-period SMA."""

    if period <= 0:
        raise DiagnosticsError("EMA period must be positive")
    result: list[float | None] = [None] * len(values)
    if len(values) < period:
        return result
    seed = sum(values[:period]) / period
    result[period - 1] = seed
    alpha = 2 / (period + 1)
    for index in range(period, len(values)):
        previous = result[index - 1]
        if previous is None:  # pragma: no cover - guarded by the seeded EMA above
            raise DiagnosticsError("EMA state was not initialized")
        result[index] = previous + alpha * (values[index] - previous)
    return result


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    return 100 - (100 / (1 + (avg_gain / avg_loss)))


def rsi(values: Sequence[float], period: int) -> list[float | None]:
    """Return a Wilder RSI series with the first value at ``period``."""

    if period <= 0:
        raise DiagnosticsError("RSI period must be positive")
    result: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return result
    gains: list[float] = []
    losses: list[float] = []
    for index in range(1, period + 1):
        change = values[index] - values[index - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    result[period] = _rsi_value(avg_gain, avg_loss)
    for index in range(period + 1, len(values)):
        change = values[index] - values[index - 1]
        gain = max(change, 0.0)
        loss = max(-change, 0.0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
        result[index] = _rsi_value(avg_gain, avg_loss)
    return result


def _crossed_above(values: Sequence[float | None], threshold: float, index: int) -> bool:
    if index <= 0:
        return False
    previous = values[index - 1]
    current = values[index]
    return previous is not None and current is not None and previous <= threshold < current


def _mean(values: Iterable[float]) -> float | None:
    values = list(values)
    return statistics.fmean(values) if values else None


def _median(values: Iterable[float]) -> float | None:
    values = list(values)
    return statistics.median(values) if values else None


def _metric_summary(values: Iterable[float]) -> dict[str, Any]:
    values = list(values)
    return {
        "count": len(values),
        "mean": _mean(values),
        "median": _median(values),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
    }


def _regime_at(
    candles: Sequence[Candle],
    closes: Sequence[float],
    ema_values: Sequence[float | None],
    index: int,
    timeframe_minutes: int,
) -> str:
    """Classify a signal using only candles ending at ``index``."""

    lookback = max(1, round((REGIME_LOOKBACK_DAYS * 24 * 60) / timeframe_minutes))
    if index < lookback:
        return "unknown"
    past_return = closes[index] / closes[index - lookback] - 1
    returns = [closes[pos] / closes[pos - 1] - 1 for pos in range(index - lookback + 1, index + 1)]
    realized_vol = statistics.pstdev(returns) * math.sqrt(lookback) if len(returns) > 1 else 0.0
    ema_value = ema_values[index]
    if (
        past_return >= REGIME_TREND_THRESHOLD
        and ema_value is not None
        and closes[index] >= ema_value
    ):
        trend = "uptrend"
    elif (
        past_return <= -REGIME_TREND_THRESHOLD
        and ema_value is not None
        and closes[index] <= ema_value
    ):
        trend = "downtrend"
    else:
        trend = "range"
    if realized_vol >= REGIME_HIGH_VOL_THRESHOLD:
        volatility = "high_volatility"
    elif realized_vol <= REGIME_LOW_VOL_THRESHOLD:
        volatility = "low_volatility"
    else:
        volatility = "normal_volatility"
    return f"{trend}/{volatility}"


def _forward_metrics(
    candles: Sequence[Candle], index: int, bars: int, fee_ratio: float,
) -> dict[str, float] | None:
    end = index + bars
    if end >= len(candles):
        return None
    entry = candles[index].close
    gross_return = candles[end].close / entry - 1
    net_return = (1 + gross_return) * (1 - fee_ratio) ** 2 - 1
    highs = [candle.high for candle in candles[index + 1 : end + 1]]
    lows = [candle.low for candle in candles[index + 1 : end + 1]]
    return {
        "gross_return": gross_return,
        "net_return": net_return,
        "mfe": max(highs) / entry - 1,
        "mae": min(lows) / entry - 1,
    }


def analyze_candles(
    candles: Sequence[Candle],
    pair: str,
    *,
    timeframe_minutes: int = DEFAULT_TIMEFRAME_MINUTES,
    fee_ratio: float = 0.001,
    horizons: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Analyze SimpleSpot's entry conditions and post-signal price paths."""

    if not candles:
        raise DiagnosticsError("Cannot analyze an empty candle sequence")
    if timeframe_minutes <= 0:
        raise DiagnosticsError("timeframe_minutes must be positive")
    if not 0 <= fee_ratio < 1:
        raise DiagnosticsError("fee_ratio must be between zero and one")
    horizons = horizons or DEFAULT_HORIZONS
    closes = [candle.close for candle in candles]
    volumes = [candle.volume for candle in candles]
    rsi_values = rsi(closes, RSI_PERIOD)
    ema_values = ema(closes, EMA_PERIOD)

    rsi_crosses = [index for index in range(len(candles)) if _crossed_above(rsi_values, 30, index)]
    volume_candidates = [index for index in rsi_crosses if volumes[index] > 0]
    ema_filtered = [
        index
        for index in volume_candidates
        if ema_values[index] is None or closes[index] <= ema_values[index]
    ]
    ema_filtered_set = set(ema_filtered)
    entry_indices = [index for index in volume_candidates if index not in ema_filtered_set]
    exit_signal_indices = [
        index for index in range(len(candles)) if _crossed_above(rsi_values, 70, index)
    ]

    forward_by_horizon: dict[str, list[float]] = defaultdict(list)
    mfe_values: list[float] = []
    mae_values: list[float] = []
    regime_values: dict[str, list[float]] = defaultdict(list)
    signal_rows: list[dict[str, Any]] = []
    for index in entry_indices:
        forward: dict[str, dict[str, float] | None] = {}
        for label, bars in horizons.items():
            metrics = _forward_metrics(candles, index, bars, fee_ratio)
            forward[label] = metrics
            if metrics is not None:
                forward_by_horizon[label].append(metrics["net_return"])
                if label == "24h":
                    mfe_values.append(metrics["mfe"])
                    mae_values.append(metrics["mae"])
        regime = _regime_at(candles, closes, ema_values, index, timeframe_minutes)
        if forward.get("24h") is not None:
            regime_values[regime].append(forward["24h"]["net_return"])  # type: ignore[index]
        signal_rows.append(
            {
                "index": index,
                "timestamp": candles[index].timestamp,
                "entry_price": candles[index].close,
                "rsi": rsi_values[index],
                "ema50": ema_values[index],
                "regime": regime,
                "forward": forward,
            }
        )

    regime_summary = {
        regime: {
            "entry_signals_with_24h_data": len(values),
            "forward_24h_net_return": _metric_summary(values),
        }
        for regime, values in sorted(regime_values.items())
    }
    return {
        "pair": pair,
        "rows": len(candles),
        "start": candles[0].timestamp,
        "end": candles[-1].timestamp,
        "parameters": {
            "rsi_period": RSI_PERIOD,
            "ema_period": EMA_PERIOD,
            "fee_ratio_per_side": fee_ratio,
            "timeframe_minutes": timeframe_minutes,
            "forward_horizons_bars": horizons,
            "regime_lookback_days": REGIME_LOOKBACK_DAYS,
            "regime_trend_threshold": REGIME_TREND_THRESHOLD,
            "regime_high_vol_threshold": REGIME_HIGH_VOL_THRESHOLD,
            "regime_low_vol_threshold": REGIME_LOW_VOL_THRESHOLD,
        },
        "signals": {
            "rsi_crosses_above_30": len(rsi_crosses),
            "volume_positive_candidates": len(volume_candidates),
            "ema_filtered_candidates": len(ema_filtered),
            "entry_signals": len(entry_indices),
            "rsi_crosses_above_70": len(exit_signal_indices),
        },
        "forward_return_net": {
            label: _metric_summary(forward_by_horizon.get(label, []))
            for label in sorted(horizons)
        },
        "mfe_24h": _metric_summary(mfe_values),
        "mae_24h": _metric_summary(mae_values),
        "regimes": regime_summary,
        "signal_rows": signal_rows,
    }


def load_and_analyze(
    path: Path,
    pair: str,
    *,
    timeframe_minutes: int = DEFAULT_TIMEFRAME_MINUTES,
    fee_ratio: float = 0.001,
) -> dict[str, Any]:
    return analyze_candles(
        load_candles(path),
        pair,
        timeframe_minutes=timeframe_minutes,
        fee_ratio=fee_ratio,
    )


def summarize_backtest_archive(zip_path: Path, strategy: str) -> dict[str, Any]:
    """Extract real Freqtrade exit reasons and fee drag from a backtest archive."""

    try:
        with ZipFile(zip_path) as archive:
            result_name = next(
                name
                for name in archive.namelist()
                if name.endswith(".json") and not name.endswith("_config.json")
            )
            payload = json.loads(archive.read(result_name))
    except (OSError, StopIteration, json.JSONDecodeError) as exc:
        raise DiagnosticsError(f"Could not read backtest archive {zip_path}: {exc}") from exc

    try:
        stats = payload["strategy"][strategy]
    except (KeyError, TypeError) as exc:
        raise DiagnosticsError(f"Backtest archive does not contain strategy {strategy}") from exc
    trades = stats.get("trades", [])
    if not isinstance(trades, list):
        raise DiagnosticsError("Backtest trades must be a list")

    exit_reasons = Counter(
        str(trade.get("exit_reason") or "unknown")
        for trade in trades
        if isinstance(trade, dict)
    )
    by_pair: dict[str, dict[str, Any]] = {}
    for pair in sorted({str(trade.get("pair")) for trade in trades if isinstance(trade, dict)}):
        pair_trades = [
            trade
            for trade in trades
            if isinstance(trade, dict) and trade.get("pair") == pair
        ]
        by_pair[pair] = {
            "trades": len(pair_trades),
            "profit_total_abs": sum(
                float(trade.get("profit_abs") or 0) for trade in pair_trades
            ),
            "profit_mean_ratio": _mean(
                float(trade.get("profit_ratio") or 0) for trade in pair_trades
            ),
        }

    fee_drag_abs = 0.0
    for trade in trades:
        if not isinstance(trade, dict):
            continue
        amount = float(trade.get("amount") or 0)
        fee_drag_abs += (
            float(trade.get("fee_open") or 0)
            * float(trade.get("open_rate") or 0)
            * amount
        )
        fee_drag_abs += (
            float(trade.get("fee_close") or 0)
            * float(trade.get("close_rate") or 0)
            * amount
        )
    return {
        "archive": zip_path.name,
        "trade_count": len(trades),
        "exit_reasons": dict(sorted(exit_reasons.items())),
        "by_pair": by_pair,
        "fee_drag_abs_approx": fee_drag_abs,
        "profit_total_abs": stats.get("profit_total_abs"),
        "profit_total_pct": stats.get("profit_total_pct"),
    }


def _parse_pair(value: str) -> str:
    return value.replace("_", "/", 1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path, help="Freqtrade json.gz OHLCV file")
    parser.add_argument("--pair", required=True)
    parser.add_argument("--fee", type=float, default=0.001)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = load_and_analyze(args.data, args.pair, fee_ratio=args.fee)
    encoded = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
