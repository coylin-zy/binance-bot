import gzip
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from strategy_validation.diagnostics import (
    Candle,
    DiagnosticsError,
    _forward_metrics,
    analyze_candles,
    ema,
    load_candles,
    rsi,
    summarize_backtest_archive,
    timeframe_to_minutes,
)


def make_candles(closes: list[float]) -> list[Candle]:
    return [
        Candle(
            timestamp_ms=1_700_000_000_000 + index * 300_000,
            open=value,
            high=value + 1,
            low=value - 1,
            close=value,
            volume=1,
        )
        for index, value in enumerate(closes)
    ]


class StrategyDiagnosticsTests(unittest.TestCase):
    def test_load_candles_accepts_freqtrade_json_gz(self) -> None:
        rows = [
            [1_700_000_000_000, 100, 101, 99, 100.5, 12],
            [1_700_000_300_000, 100.5, 102, 100, 101, 13],
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "BTC_USDT-5m.json.gz"
            with gzip.open(path, "wt", encoding="utf-8") as handle:
                json.dump(rows, handle)
            candles = load_candles(path)
        self.assertEqual(len(candles), 2)
        self.assertEqual(candles[0].close, 100.5)
        self.assertEqual(candles[1].timestamp, "2023-11-14T22:18:20+00:00")

    def test_load_candles_rejects_invalid_ohlc_and_order(self) -> None:
        invalid_rows = [
            [1_700_000_000_000, 100, 99, 98, 98.5, 1],
            [1_700_000_300_000, 100, 101, 100, 100.5, 1],
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid.json.gz"
            with gzip.open(path, "wt", encoding="utf-8") as handle:
                json.dump(invalid_rows, handle)
            with self.assertRaises(DiagnosticsError):
                load_candles(path)

    def test_indicators_seed_without_lookahead(self) -> None:
        values = [100, 101, 102, 103, 104]
        self.assertEqual(ema(values, 3)[:2], [None, None])
        self.assertEqual(ema(values, 3)[2], 101.0)
        self.assertEqual(rsi(values, 3)[:3], [None, None, None])
        self.assertEqual(rsi(values, 3)[3], 100.0)

    def test_timeframe_conversion(self) -> None:
        self.assertEqual(timeframe_to_minutes("5m"), 5)
        self.assertEqual(timeframe_to_minutes("1h"), 60)
        with self.assertRaises(DiagnosticsError):
            timeframe_to_minutes("30s")

    def test_forward_metrics_apply_two_sided_fee(self) -> None:
        candles = [
            Candle(1, 100, 100, 100, 100, 1),
            Candle(2, 100, 110, 95, 101, 1),
            Candle(3, 101, 112, 90, 105, 1),
        ]
        result = _forward_metrics(candles, 0, 2, 0.001)
        if result is None:
            self.fail("Expected forward metrics for a complete horizon")
        self.assertAlmostEqual(result["gross_return"], 0.05)
        self.assertAlmostEqual(result["net_return"], 1.05 * (0.999**2) - 1)
        self.assertAlmostEqual(result["mfe"], 0.12)
        self.assertAlmostEqual(result["mae"], -0.1)

    def test_analysis_exposes_signal_and_forward_diagnostics(self) -> None:
        closes = [100 - (index * 0.2) for index in range(80)]
        closes.extend(84 + (index * 1.5) for index in range(80))
        report = analyze_candles(make_candles(closes), "BTC/USDT", horizons={"1h": 12})
        self.assertEqual(report["pair"], "BTC/USDT")
        self.assertIn("rsi_crosses_above_30", report["signals"])
        self.assertIn("1h", report["forward_return_net"])
        self.assertIn("mfe_24h", report)
        self.assertIn("mae_24h", report)
        self.assertIn("regimes", report)
        self.assertTrue(all(row["index"] < len(closes) for row in report["signal_rows"]))

    def test_backtest_archive_summary_extracts_exit_reasons_and_fees(self) -> None:
        payload = {
            "strategy": {
                "SimpleSpot": {
                    "profit_total_abs": 0.25,
                    "profit_total_pct": 1.25,
                    "trades": [
                        {
                            "pair": "BTC/USDT",
                            "exit_reason": "exit_signal",
                            "profit_abs": 0.3,
                            "profit_ratio": 0.015,
                            "amount": 0.01,
                            "open_rate": 30000,
                            "close_rate": 30400,
                            "fee_open": 0.001,
                            "fee_close": 0.001,
                        },
                        {
                            "pair": "ETH/USDT",
                            "exit_reason": "roi",
                            "profit_abs": -0.05,
                            "profit_ratio": -0.01,
                            "amount": 0.1,
                            "open_rate": 2000,
                            "close_rate": 1980,
                            "fee_open": 0.001,
                            "fee_close": 0.001,
                        },
                    ],
                }
            }
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            archive_path = Path(temp_dir) / "result.zip"
            with ZipFile(archive_path, "w") as archive:
                archive.writestr("result.json", json.dumps(payload))
            result = summarize_backtest_archive(archive_path, "SimpleSpot")
        self.assertEqual(result["trade_count"], 2)
        self.assertEqual(result["exit_reasons"], {"exit_signal": 1, "roi": 1})
        self.assertEqual(set(result["by_pair"]), {"BTC/USDT", "ETH/USDT"})
        self.assertGreater(result["fee_drag_abs_approx"], 0)


if __name__ == "__main__":
    unittest.main()
