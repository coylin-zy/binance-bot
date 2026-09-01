import json
import tempfile
import unittest
from pathlib import Path

from strategy_validation.acceptance import AcceptanceError, evaluate, read_json, validate_criteria


def criteria_document() -> dict:
    return {
        "schema_version": 1,
        "version": "test-v1",
        "status": "frozen",
        "criteria": {
            "min_trade_count": 2,
            "min_profit_factor": 1.05,
            "max_drawdown_ratio": 0.1,
            "min_net_return_ratio": 0,
            "max_single_pair_pnl_contribution_ratio": 0.75,
            "max_consecutive_losses": 6,
            "max_signal_divergence_ratio": 0.05,
            "max_fill_deviation_ratio": 0.0025,
            "min_uptime_ratio": 0.99,
            "max_api_error_ratio": 0.01,
            "require_restart_recovery": True,
            "require_data_integrity": True,
        },
    }


def metrics(**overrides: object) -> dict:
    values: dict[str, object] = {
        "schema_version": 1,
        "trade_count": 2,
        "profit_factor": 1.2,
        "net_return_ratio": 0.03,
        "max_drawdown_ratio": 0.05,
        "single_pair_pnl_contribution_ratio": 0.6,
        "max_consecutive_losses": 3,
        "signal_divergence_ratio": 0.01,
        "fill_deviation_ratio": 0.001,
        "uptime_ratio": 0.999,
        "api_error_ratio": 0.002,
        "restart_recovery": True,
        "data_integrity": True,
    }
    values.update(overrides)
    return values


class DryRunAcceptanceTests(unittest.TestCase):
    def test_frozen_repository_criteria_is_valid(self) -> None:
        path = Path(__file__).parents[1] / "dry-run-acceptance.json"
        validate_criteria(read_json(path))

    def test_pass_verdict_requires_all_gates(self) -> None:
        verdict = evaluate(metrics(), criteria_document())
        self.assertEqual(verdict["status"], "passed")
        self.assertEqual(verdict["failed_checks"], [])

    def test_failed_verdict_is_machine_readable(self) -> None:
        verdict = evaluate(metrics(profit_factor=0.8, data_integrity=False), criteria_document())
        self.assertEqual(verdict["status"], "research_failed")
        self.assertEqual(verdict["failed_checks"], ["min_profit_factor", "require_data_integrity"])

    def test_unfrozen_criteria_is_rejected(self) -> None:
        document = criteria_document()
        document["status"] = "draft"
        with self.assertRaises(AcceptanceError):
            validate_criteria(document)

    def test_cli_input_reader_rejects_non_object(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid.json"
            path.write_text(json.dumps([]), encoding="utf-8")
            with self.assertRaises(AcceptanceError):
                read_json(path)


if __name__ == "__main__":
    unittest.main()
