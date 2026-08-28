import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from strategy_validation import pipeline


class StrategyValidationTests(unittest.TestCase):
    def test_current_protocol_is_valid(self) -> None:
        protocol = pipeline.read_json(pipeline.PROTOCOL_PATH)
        pipeline.validate_protocol(protocol)

    def test_recursive_no_variance_output(self) -> None:
        result = pipeline.parse_recursive_output(
            "No variance on indicator(s) found due to recursive formula.", 200, 0.1
        )
        self.assertEqual(result["status"], "no_variance")
        self.assertEqual(result["max_abs_variance_pct"], 0.0)

    def test_recursive_table_parsing(self) -> None:
        output = """
┃ Indicators ┃ 99 ┃ 200 (from strategy) ┃ 399 ┃
│ rsi        │ 1% │ 0.050%              │ -   │
│ ema50      │ 2% │ -0.020%             │ -   │
"""
        result = pipeline.parse_recursive_output(output, 200, 0.1)
        self.assertEqual(result["status"], "parsed")
        self.assertEqual(result["max_abs_variance_pct"], 0.05)

    def test_recursive_threshold_is_enforced(self) -> None:
        output = """
┃ Indicators ┃ 200 (from strategy) ┃
│ ema50      │ 0.200%              │
"""
        with self.assertRaises(pipeline.PipelineError):
            pipeline.parse_recursive_output(output, 200, 0.1)

    def test_backtest_archive_summary(self) -> None:
        payload = {
            "strategy": {
                "SimpleSpot": {
                    "total_trades": 3,
                    "wins": 2,
                    "draws": 0,
                    "losses": 1,
                    "profit_total": 0.015,
                    "profit_factor": 1.2,
                    "max_drawdown_account": 0.03,
                    "sharpe": 0.7,
                    "sortino": 0.9,
                    "market_change": -0.1,
                    "backtest_start": "2024-01-01",
                    "backtest_end": "2024-04-01",
                }
            }
        }
        phase = {
            "id": "development_2024_q1",
            "role": "development",
            "timerange": "20240101-20240401",
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            archive_path = Path(temp_dir) / "result.zip"
            with ZipFile(archive_path, "w") as archive:
                archive.writestr("result.json", json.dumps(payload))
            result = pipeline.summarize_backtest(archive_path, "SimpleSpot", phase)
        self.assertEqual(result["total_trades"], 3)
        self.assertEqual(result["profit_total_pct"], 1.5)


if __name__ == "__main__":
    unittest.main()
