#!/usr/bin/env python3
"""Create and validate reproducible strategy experiment manifests."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class ExperimentError(ValueError):
    """Raised when an experiment manifest is incomplete or unsafe to compare."""


EXPERIMENT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
GIT_SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise ExperimentError(f"Could not hash {path}: {exc}") from exc
    return digest.hexdigest()


def git_sha(repo_root: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ExperimentError(f"Could not resolve Git HEAD in {repo_root}") from exc
    value = result.stdout.strip()
    if not GIT_SHA_RE.fullmatch(value):
        raise ExperimentError(f"Git HEAD is not a full commit SHA: {value!r}")
    return value


def _require_text(value: Any, field: str, maximum: int = 512) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ExperimentError(f"{field} must be a non-empty string of at most {maximum} characters")
    return value.strip()


def _require_object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ExperimentError(f"{field} must be an object")
    return dict(value)


# Manifest validation is intentionally exhaustive because it is the experiment gate.
def validate_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:  # noqa: C901
    document = dict(manifest)
    if document.get("schema_version") != 1:
        raise ExperimentError("Experiment manifest schema_version must be 1")
    experiment_id = document.get("experiment_id")
    if not isinstance(experiment_id, str) or not EXPERIMENT_ID_RE.fullmatch(experiment_id):
        raise ExperimentError("experiment_id must match [a-z0-9][a-z0-9._-]{2,63}")
    _require_text(document.get("strategy_version"), "strategy_version", 128)
    _require_text(document.get("hypothesis"), "hypothesis")
    role = document.get("role")
    if role not in {"baseline", "candidate"}:
        raise ExperimentError("role must be baseline or candidate")

    changes = document.get("changes")
    if not isinstance(changes, list):
        raise ExperimentError("changes must be an array")
    if role == "baseline" and changes:
        raise ExperimentError("baseline experiments cannot declare changes")
    if role == "candidate" and len(changes) != 1:
        raise ExperimentError("candidate experiments must change exactly one factor")
    for change in changes:
        item = _require_object(change, "change")
        _require_text(item.get("factor"), "change.factor", 128)
        if "before" not in item or "after" not in item:
            raise ExperimentError("each change must include before and after values")
        if item["before"] == item["after"]:
            raise ExperimentError("a change must alter its factor")

    parameters = _require_object(document.get("parameters"), "parameters")
    if role == "candidate" and not document.get("baseline_experiment_id"):
        raise ExperimentError("candidate experiments must reference baseline_experiment_id")
    if document.get("baseline_experiment_id") is not None:
        baseline_id = document["baseline_experiment_id"]
        if not isinstance(baseline_id, str) or not EXPERIMENT_ID_RE.fullmatch(baseline_id):
            raise ExperimentError("baseline_experiment_id is invalid")

    source = _require_object(document.get("source"), "source")
    for field in ("strategy_sha256", "protocol_sha256", "dataset_lock_sha256"):
        value = source.get(field)
        if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
            raise ExperimentError(f"source.{field} must be a SHA-256 hex digest")
    source_git = source.get("git_sha")
    if not isinstance(source_git, str) or not GIT_SHA_RE.fullmatch(source_git):
        raise ExperimentError("source.git_sha must be a full Git commit SHA")
    _require_text(document.get("created_at_utc"), "created_at_utc", 64)
    document["parameters"] = parameters
    document["source"] = source
    return document


def build_manifest(
    repo_root: Path,
    *,
    experiment_id: str,
    strategy_version: str,
    role: str,
    hypothesis: str,
    changes: list[dict[str, Any]] | None = None,
    parameters: Mapping[str, Any] | None = None,
    baseline_experiment_id: str | None = None,
) -> dict[str, Any]:
    strategy_path = repo_root / "user_data" / "strategies" / "SimpleSpot.py"
    protocol_path = repo_root / "strategy_validation" / "protocol.json"
    lock_path = repo_root / "strategy_validation" / "dataset-lock.json"
    manifest = {
        "schema_version": 1,
        "experiment_id": experiment_id,
        "strategy_version": strategy_version,
        "role": role,
        "hypothesis": hypothesis,
        "changes": changes or [],
        "parameters": dict(parameters or {}),
        "baseline_experiment_id": baseline_experiment_id,
        "created_at_utc": datetime.now(UTC).isoformat(),
        "source": {
            "git_sha": git_sha(repo_root),
            "strategy_sha256": sha256_file(strategy_path),
            "protocol_sha256": sha256_file(protocol_path),
            "dataset_lock_sha256": sha256_file(lock_path),
        },
    }
    return validate_manifest(manifest)


def _json_argument(value: str, field: str) -> Any:
    try:
        path = Path(value)
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
        return json.loads(value)
    except (OSError, json.JSONDecodeError) as exc:
        raise ExperimentError(f"Invalid {field} JSON") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    create = subparsers.add_parser(
        "create", help="Create a manifest bound to the current repository"
    )
    create.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    create.add_argument("--experiment-id", required=True)
    create.add_argument("--strategy-version", required=True)
    create.add_argument("--role", choices=("baseline", "candidate"), default="candidate")
    create.add_argument("--hypothesis", required=True)
    create.add_argument("--changes", default="[]", help="JSON array or path to a JSON array")
    create.add_argument("--parameters", default="{}", help="JSON object or path to a JSON object")
    create.add_argument("--baseline-experiment-id")
    create.add_argument("--output", type=Path, required=True)
    validate = subparsers.add_parser("validate", help="Validate an existing manifest")
    validate.add_argument("manifest", type=Path)
    args = parser.parse_args()

    try:
        if args.command == "create":
            changes = _json_argument(args.changes, "changes")
            parameters = _json_argument(args.parameters, "parameters")
            if not isinstance(changes, list) or not isinstance(parameters, Mapping):
                raise ExperimentError("changes must be a JSON array and parameters a JSON object")
            document = build_manifest(
                args.repo_root,
                experiment_id=args.experiment_id,
                strategy_version=args.strategy_version,
                role=args.role,
                hypothesis=args.hypothesis,
                changes=[dict(item) for item in changes],
                parameters=parameters,
                baseline_experiment_id=args.baseline_experiment_id,
            )
            args.output.write_text(
                json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            print(f"Wrote {args.output}")
        else:
            document = _require_object(
                json.loads(args.manifest.read_text(encoding="utf-8")), "manifest"
            )
            validate_manifest(document)
            print("Experiment manifest: OK")
    except (ExperimentError, OSError, json.JSONDecodeError) as exc:
        print(f"experiment error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
