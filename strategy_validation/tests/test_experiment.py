import unittest
from pathlib import Path

from strategy_validation.experiment import ExperimentError, build_manifest, validate_manifest


ROOT = Path(__file__).parents[2]


class ExperimentManifestTests(unittest.TestCase):
    def test_baseline_manifest_binds_repository_hashes(self) -> None:
        manifest = build_manifest(
            ROOT,
            experiment_id="simplespot-v1-baseline",
            strategy_version="SimpleSpot-v1",
            role="baseline",
            hypothesis="Freeze the existing deterministic strategy as the comparison group.",
            parameters={"rsi_period": 14, "ema_period": 50},
        )
        self.assertEqual(manifest["changes"], [])
        self.assertEqual(len(manifest["source"]["git_sha"]), 40)
        self.assertEqual(len(manifest["source"]["strategy_sha256"]), 64)

    def test_candidate_requires_one_change_and_baseline(self) -> None:
        base = {
            "schema_version": 1,
            "experiment_id": "simplespot-v2-ema",
            "strategy_version": "SimpleSpot-v2",
            "role": "candidate",
            "hypothesis": "A slower trend filter reduces false entries.",
            "changes": [{"factor": "ema_period", "before": 50, "after": 100}],
            "parameters": {"ema_period": 100},
            "baseline_experiment_id": "simplespot-v1-baseline",
            "created_at_utc": "2026-09-01T00:00:00+00:00",
            "source": {
                "git_sha": "0123456789abcdef0123456789abcdef01234567",
                "strategy_sha256": "a" * 64,
                "protocol_sha256": "b" * 64,
                "dataset_lock_sha256": "c" * 64,
            },
        }
        self.assertEqual(validate_manifest(base)["role"], "candidate")
        base["changes"].append({"factor": "rsi_period", "before": 14, "after": 21})
        with self.assertRaises(ExperimentError):
            validate_manifest(base)

    def test_baseline_cannot_change_a_factor(self) -> None:
        with self.assertRaises(ExperimentError):
            build_manifest(
                ROOT,
                experiment_id="simplespot-v1-invalid",
                strategy_version="SimpleSpot-v1",
                role="baseline",
                hypothesis="Invalid baseline",
                changes=[{"factor": "ema_period", "before": 50, "after": 100}],
            )


if __name__ == "__main__":
    unittest.main()
