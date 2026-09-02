import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from strategy_validation.forward_run import (
    _append_jsonl,
    calculate_metrics,
    initialize_run,
    record_restart_check,
    write_report,
    write_signal_audit,
)


def runtime_config() -> dict:
    return {
        "dry_run": True,
        "dry_run_wallet": 20,
        "trading_mode": "spot",
        "timeframe": "5m",
        "exchange": {
            "name": "binance",
            "pair_whitelist": ["BTC/USDT", "ETH/USDT", "XRP/USDT"],
        },
        "api_server": {"username": "collector-user", "password": "collector-secret"},
    }


def trade(
    trade_id: int,
    pair: str,
    opened: datetime,
    closed: datetime,
    profit: float,
) -> dict:
    return {
        "trade_id": trade_id,
        "pair": pair,
        "strategy": "SimpleSpot",
        "is_open": False,
        "open_timestamp": int(opened.timestamp() * 1000),
        "open_fill_timestamp": int(opened.timestamp() * 1000),
        "open_rate": 100.0,
        "open_rate_requested": 100.0,
        "close_timestamp": int(closed.timestamp() * 1000),
        "close_rate": 101.0,
        "close_rate_requested": 101.0,
        "close_profit_abs": profit,
        "profit_abs": profit,
        "exit_reason": "roi",
    }


class ForwardRunTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.run_dir = self.root / "run"
        self.config_path = self.root / "config.json"
        self.config_path.write_text(json.dumps(runtime_config()), encoding="utf-8")
        self.criteria_path = Path(__file__).parents[1] / "dry-run-acceptance.json"
        self.started = datetime(2026, 1, 1, tzinfo=UTC)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def initialize(self) -> dict:
        return initialize_run(
            self.run_dir,
            self.criteria_path,
            self.config_path,
            run_id="simple-v1-forward-20260101",
            interval_seconds=86400,
            lineage={"git_sha": "a" * 40, "strategy_sha": "b" * 64},
            now=self.started,
        )

    def test_manifest_freezes_scope_without_credentials(self) -> None:
        manifest = self.initialize()
        encoded = json.dumps(manifest)
        self.assertNotIn("collector-user", encoded)
        self.assertNotIn("collector-secret", encoded)
        self.assertEqual(manifest["minimum_observation_days"], 30)
        self.assertEqual(manifest["runtime"]["pairs"], ["BTC/USDT", "ETH/USDT", "XRP/USDT"])

    def test_metrics_derive_from_forward_trades_and_evidence(self) -> None:
        self.initialize()
        final_trades = [
            trade(
                1,
                "BTC/USDT",
                self.started + timedelta(days=1),
                self.started + timedelta(days=2),
                2.0,
            ),
            trade(
                2,
                "ETH/USDT",
                self.started + timedelta(days=2),
                self.started + timedelta(days=3),
                -1.0,
            ),
        ]
        for day in range(32):
            observed = self.started + timedelta(days=day)
            _append_jsonl(
                self.run_dir / "observations.jsonl",
                {
                    "schema_version": 1,
                    "sequence": day + 1,
                    "observed_at": observed.isoformat(),
                    "observed_timestamp_ms": int(observed.timestamp() * 1000),
                    "slot": day,
                    "request_ok": True,
                    "state": "running",
                    "trades": final_trades if day == 31 else [],
                },
            )
        write_signal_audit(
            self.run_dir,
            expected=2,
            matched=2,
            unexpected=0,
            source_snapshot_sha256="c" * 64,
        )
        record_restart_check(
            self.run_dir,
            before_state="running",
            after_state="running",
            before_trade_count=0,
            after_trade_count=0,
            downtime_seconds=8.5,
            now=self.started + timedelta(days=4),
        )

        metrics = calculate_metrics(
            self.run_dir,
            self.criteria_path,
            as_of=self.started + timedelta(days=31),
        )
        self.assertEqual(metrics["trade_count"], 2)
        self.assertEqual(metrics["profit_factor"], 2.0)
        self.assertAlmostEqual(metrics["net_return_ratio"], 0.05)
        self.assertAlmostEqual(metrics["single_pair_pnl_contribution_ratio"], 2 / 3)
        self.assertEqual(metrics["signal_divergence_ratio"], 0)
        self.assertEqual(metrics["fill_deviation_ratio"], 0)
        self.assertEqual(metrics["uptime_ratio"], 1)
        self.assertTrue(metrics["restart_recovery"])
        self.assertTrue(metrics["data_integrity"])

    def test_nonfinal_report_stays_collecting_before_time_gate(self) -> None:
        self.initialize()
        _append_jsonl(
            self.run_dir / "observations.jsonl",
            {
                "schema_version": 1,
                "sequence": 1,
                "observed_at": self.started.isoformat(),
                "observed_timestamp_ms": int(self.started.timestamp() * 1000),
                "slot": 0,
                "request_ok": True,
                "state": "running",
                "trades": [],
            },
        )
        verdict = write_report(
            self.run_dir,
            self.criteria_path,
            as_of=self.started + timedelta(days=1),
        )
        self.assertEqual(verdict["status"], "collecting")
        self.assertEqual(verdict["acceptance_status"], "research_failed")
        self.assertFalse(verdict["final"])


if __name__ == "__main__":
    unittest.main()
