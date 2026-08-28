# Reproducible strategy validation

This directory defines the evidence pipeline for `SimpleSpot`. It intentionally does
not run Hyperopt and it does not approve live trading.

The protocol fixes:

- Binance global spot as the exchange and trading mode
- BTC/USDT, ETH/USDT, and XRP/USDT through `StaticPairList`
- 5-minute candles from three non-overlapping market windows
- a 0.1% fee on entry and again on exit
- development, validation, and sealed holdout roles
- lookahead and recursive-formula checks

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

Generated JSON, Markdown, raw backtest archives, and analysis logs are written beneath
`strategy_validation/output/` and are uploaded by GitHub Actions.

The holdout period must not be used to tune RSI, EMA, ROI, stoploss, trailing-stop, or
future protection parameters. Any dataset refresh must happen in a dedicated reviewable
change that regenerates `dataset-lock.json`.
