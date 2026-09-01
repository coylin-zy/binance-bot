# Reproducible strategy validation

This directory defines the evidence pipeline for `SimpleSpot`. It intentionally does
not run Hyperopt and it does not approve live trading.

The pipeline also produces a strategy-diagnostics section for every phase and pair.
It counts RSI/EMA candidates, measures EMA filtering, and calculates fee-aware
forward returns plus 24-hour MFE/MAE. Exit-reason counts are read from the actual
Freqtrade backtest archive rather than inferred from the candle data.

The protocol fixes:

- Binance global spot as the exchange and trading mode
- BTC/USDT, ETH/USDT, and XRP/USDT through `StaticPairList`
- 5-minute candles from three non-overlapping market windows
- a 0.1% fee on entry and again on exit
- development, validation, and sealed holdout roles
- lookahead and recursive-formula checks
- signal frequency, EMA filtering, forward returns, MFE/MAE, regimes, and exit reasons

The validation-only configuration routes public market-data calls through Binance's
official `data-api.binance.vision` REST endpoint and
`data-stream.binance.vision` WebSocket endpoint, and limits CCXT market discovery to
spot. It does not change or proxy the private API used by a real runtime configuration.

`data/` contains versioned `json.gz` candle snapshots. `dataset-lock.json` records the
SHA-256 and byte length of every file. CI fails if a candle changes, disappears, or is
added without intentionally rebuilding the lock.

Run the same checks locally from an environment where the repository version of
Freqtrade is installed:

```bash
python strategy_validation/pipeline.py validate --require-data
python -m unittest discover -s strategy_validation/tests -v
python strategy_validation/pipeline.py run --freqtrade freqtrade
```

To inspect one locked candle file without running a backtest:

```bash
python strategy_validation/diagnostics.py \
  strategy_validation/data/holdout_2025_h1/BTC_USDT-5m.json.gz \
  --pair BTC/USDT
```

Generated JSON, Markdown, raw backtest archives, and analysis logs are written beneath
`strategy_validation/output/` and are uploaded by GitHub Actions.

The holdout period must not be used to tune RSI, EMA, ROI, stoploss, trailing-stop, or
future protection parameters. Any dataset refresh must happen in a dedicated reviewable
change that regenerates `dataset-lock.json`.

The sealed holdout spans 2025-01-01 through 2026-06-30. It is intentionally longer
than the development and validation windows because the current strategy emits very
few signals; the lookahead gate still requires at least five analyzed signals.
