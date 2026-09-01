#!/usr/bin/env python3
"""Evaluate frozen forward dry-run acceptance criteria.

The evaluator is deliberately independent from Freqtrade.  A forward-test
collector can emit one metrics JSON document, then this module produces a
machine-readable verdict without changing the strategy or placing orders.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class AcceptanceError(ValueError):
    """Raised when criteria or observed forward-test metrics are invalid."""


CRITERIA_FIELDS = {
    "min_trade_count": int,
    "min_profit_factor": (int, float),
    "max_drawdown_ratio": (int, float),
    "min_net_return_ratio": (int, float),
    "max_single_pair_pnl_contribution_ratio": (int, float),
    "max_consecutive_losses": int,
    "max_signal_divergence_ratio": (int, float),
    "max_fill_deviation_ratio": (int, float),
    "min_uptime_ratio": (int, float),
    "max_api_error_ratio": (int, float),
    "require_restart_recovery": bool,
    "require_data_integrity": bool,
}


@dataclass(frozen=True)
class CriterionResult:
    key: str
    passed: bool
    observed: Any
    expected: Any
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "passed": self.passed,
            "observed": self.observed,
            "expected": self.expected,
            "reason": self.reason,
        }


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AcceptanceError(f"Could not read JSON document {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise AcceptanceError(f"JSON document {path} must contain an object")
    return payload


def validate_criteria(document: dict[str, Any]) -> dict[str, Any]:
    if document.get("schema_version") != 1:
        raise AcceptanceError("Acceptance criteria schema_version must be 1")
    if document.get("status") != "frozen":
        raise AcceptanceError("Acceptance criteria must be marked frozen before forward-test")
    criteria = document.get("criteria")
    if not isinstance(criteria, dict):
        raise AcceptanceError("Acceptance criteria must contain a criteria object")

    for key, expected_type in CRITERIA_FIELDS.items():
        value = criteria.get(key)
        valid_type = isinstance(value, expected_type) and (
            isinstance(value, bool) == (expected_type is bool)
        )
        if not valid_type:
            raise AcceptanceError(f"Acceptance criterion {key} has an invalid type")
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value < 0:
            raise AcceptanceError(f"Acceptance criterion {key} must be non-negative")
    if criteria["min_profit_factor"] <= 0:
        raise AcceptanceError("min_profit_factor must be positive")
    if criteria["min_uptime_ratio"] > 1 or criteria["max_api_error_ratio"] > 1:
        raise AcceptanceError("uptime and API error ratios must be between zero and one")
    if criteria["max_drawdown_ratio"] > 1 or criteria["max_single_pair_pnl_contribution_ratio"] > 1:
        raise AcceptanceError("drawdown and pair contribution ratios must be between zero and one")
    for key in ("max_signal_divergence_ratio", "max_fill_deviation_ratio"):
        if criteria[key] > 1:
            raise AcceptanceError(f"{key} must be between zero and one")
    return criteria


def _number(metrics: dict[str, Any], key: str) -> float | int | None:
    value = metrics.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value


def evaluate(metrics: dict[str, Any], criteria_document: dict[str, Any]) -> dict[str, Any]:
    criteria = validate_criteria(criteria_document)
    if metrics.get("schema_version") != 1:
        raise AcceptanceError("Forward-test metrics schema_version must be 1")

    results: list[CriterionResult] = []

    def minimum(key: str, label: str) -> None:
        observed = _number(metrics, key)
        expected = criteria[label]
        passed = observed is not None and observed >= expected
        results.append(
            CriterionResult(label, passed, observed, expected, f"{key} must be >= {expected}")
        )

    def maximum(key: str, label: str) -> None:
        observed = _number(metrics, key)
        expected = criteria[label]
        passed = observed is not None and observed <= expected
        results.append(
            CriterionResult(label, passed, observed, expected, f"{key} must be <= {expected}")
        )

    minimum("trade_count", "min_trade_count")
    minimum("profit_factor", "min_profit_factor")
    minimum("net_return_ratio", "min_net_return_ratio")
    minimum("uptime_ratio", "min_uptime_ratio")
    maximum("max_drawdown_ratio", "max_drawdown_ratio")
    maximum("single_pair_pnl_contribution_ratio", "max_single_pair_pnl_contribution_ratio")
    maximum("max_consecutive_losses", "max_consecutive_losses")
    maximum("signal_divergence_ratio", "max_signal_divergence_ratio")
    maximum("fill_deviation_ratio", "max_fill_deviation_ratio")
    maximum("api_error_ratio", "max_api_error_ratio")

    restart_recovery = metrics.get("restart_recovery")
    results.append(
        CriterionResult(
            "require_restart_recovery",
            restart_recovery is criteria["require_restart_recovery"]
            if isinstance(restart_recovery, bool)
            else False,
            restart_recovery,
            criteria["require_restart_recovery"],
            "restart_recovery must match the frozen requirement",
        )
    )
    data_integrity = metrics.get("data_integrity")
    results.append(
        CriterionResult(
            "require_data_integrity",
            data_integrity is criteria["require_data_integrity"]
            if isinstance(data_integrity, bool)
            else False,
            data_integrity,
            criteria["require_data_integrity"],
            "data_integrity must match the frozen requirement",
        )
    )

    passed = all(item.passed for item in results)
    return {
        "schema_version": 1,
        "status": "passed" if passed else "research_failed",
        "criteria_version": criteria_document.get("version", "unversioned"),
        "criteria_sha256": criteria_document.get("sha256"),
        "metrics": metrics,
        "criteria": criteria,
        "checks": [item.as_dict() for item in results],
        "failed_checks": [item.key for item in results if not item.passed],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("metrics", type=Path, help="Forward-test metrics JSON")
    parser.add_argument(
        "--criteria",
        type=Path,
        default=Path(__file__).with_name("dry-run-acceptance.json"),
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    try:
        verdict = evaluate(read_json(args.metrics), read_json(args.criteria))
    except AcceptanceError as exc:
        print(f"dry-run acceptance error: {exc}", file=sys.stderr)
        return 1
    encoded = json.dumps(verdict, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")
    return 0 if verdict["status"] == "passed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
