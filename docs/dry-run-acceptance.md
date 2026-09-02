# Forward dry-run acceptance criteria

This document freezes the research gates before the first unseen-data forward
test. The machine-readable source is
`strategy_validation/dry-run-acceptance.json`; changing either file after a
forward-test starts requires a new criteria version and a new experiment.

The gates are deliberately stricter than “the process stayed alive”, but they
are not a live-trading approval. A failed run is recorded as `research_failed`
and remains useful evidence; it must not be relabeled after the fact.

| Metric | Frozen gate |
| --- | ---: |
| Minimum observation period | 30 days |
| Minimum closed trades | 30 |
| Minimum profit factor | 1.05 |
| Minimum net return after fees | 0% |
| Maximum account drawdown | 10% |
| Maximum single-pair PnL contribution | 75% |
| Maximum consecutive losses | 6 |
| Maximum backtest/dry-run signal divergence | 5% |
| Maximum expected/simulated fill deviation | 0.25% |
| Minimum uptime | 99% |
| Maximum API error ratio | 1% |
| Restart recovery | Required |
| Data integrity | Required |

The evaluator expects a metrics document with `schema_version: 1` and these
fields:

```json
{
  "schema_version": 1,
  "observation_days": 31,
  "trade_count": 30,
  "profit_factor": 1.2,
  "net_return_ratio": 0.03,
  "max_drawdown_ratio": 0.05,
  "single_pair_pnl_contribution_ratio": 0.6,
  "max_consecutive_losses": 3,
  "signal_divergence_ratio": 0.01,
  "fill_deviation_ratio": 0.001,
  "uptime_ratio": 0.999,
  "api_error_ratio": 0.002,
  "restart_recovery": true,
  "data_integrity": true
}
```

Run the deterministic evaluator with:

```bash
python strategy_validation/acceptance.py forward-metrics.json
```

Exit code `0` means every frozen gate passed. Exit code `2` means the run was
evaluated and failed one or more research gates. Invalid criteria or malformed
metrics exit with `1`.

Production observations are written below the ignored
`user_data/forward_runs/<run-id>/` directory by
`binance-bot-forward-sample.timer`. Each manifest freezes runtime lineage and the
SHA-256 of these criteria before the first sample. Missing timer slots count against
uptime, and credentials are never copied into the evidence files.
