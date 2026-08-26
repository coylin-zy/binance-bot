# Design QA — Neural Terminal Freqtrade Dashboard

Date: 2026-08-26  
Reference: `stitch_terminal_trading_bot_dashboard.zip`  
Reference SHA-256: `FFB33DDC7D96D4C6CA6CE7177FFF53AF4D8AFCD0374C24F7C3BB54B0D1F4E72C`

## Scope

- Login terminal
- Dashboard overview
- Realtime candlestick view
- Trade history and profit curve
- Safe operations console
- Desktop and mobile responsive behavior

## Fidelity checks

- Typography: JetBrains Mono for operational text and Space Mono for display headings, matching the supplied terminal direction.
- Color: near-black layered surfaces, `#00ff41` primary accent, pale terminal text, dusty green borders, and restrained red danger states.
- Shape: sharp 2px radii, thin rules, flat control groups, and no generic glass-card or large-radius admin UI treatment.
- Layout: persistent desktop navigation, editorial page headings, bordered telemetry grids, right-side status rails, and compact high-density tables.
- Icons: one consistent Lucide family with thin strokes; no emoji or text-symbol substitutes.
- Safe deviation: reference manual buy/sell, force-sell, config commit, and override controls were intentionally not implemented. The project keeps its approved read-only and lifecycle-only boundary.

## Functional findings and fixes

1. Period responses were read as arrays although Freqtrade returns `{ data: [...] }`; normalized and tested.
2. Trade history was read from `data` although Freqtrade returns `{ trades: [...] }`; normalized and tested.
3. Percent values could be multiplied twice by using `profit_pct`; UI now consistently uses ratio fields.
4. Strategy name used the wrong `strategy_name` property; corrected to `strategy`.
5. Refresh-only sessions were rejected and refreshed tokens were not persisted; API routes now refresh and rotate cookies.
6. Fetchers accepted failed HTTP responses as normal data; shared fetch helpers now throw typed errors and render explicit failure states.
7. EventSource listeners were removed with different callback identities; cleanup now retains the registered handlers.
8. The initial realtime state showed a false disconnect warning; the warning now renders only after a confirmed disconnect.
9. Next 16 development scripts were blocked when QA used `127.0.0.1`; a documented, scoped `allowedDevOrigins` entry was added.
10. Mobile history previously depended on a wide desktop table; it now renders dedicated execution cards.
11. Stop action had no confirmation or user feedback; it now has an in-app confirmation dialog, success feedback, and visible errors.
12. The old Compose override published duplicate ports while Freqtrade listened on the wrong container port; the scoped override now aligns the API on container port `8080`, keeps host access on `127.0.0.1:8080`, and injects the WebSocket token from the environment.
13. The chart exposed unsupported `15m`, `1h`, `4h`, and `1d` choices even though the running strategy only publishes analyzed `5m` candles; the timeframe is now a read-only value sourced from live configuration, and empty candle responses have an explicit `NO DATA` state.
14. The production preview requested a missing `/favicon.ico`; an app icon was added and the clean-browser console now stays error-free.

## Verification evidence

- Desktop viewport: 1440 × 1000
- Mobile viewport: 390 × 844
- Production standalone preview connected to the local Freqtrade `2026.7` container in Binance US spot dry-run mode.
- All routes returned the expected page identity: `/`, `/chart`, `/trades`, `/settings`.
- Desktop and mobile document widths stayed at or below the viewport; no horizontal overflow was observed.
- Browser console errors in the production pass: 0.
- Live API verified: authentication plus `show_config`, `balance`, `profit`, daily/weekly/monthly periods, status, trades, whitelist, and 500-row candle data.
- BFF verified: unauthenticated requests return `401`; manual entry, exit, and config reload endpoints return `403`.
- Realtime verified: authenticated SSE reports disconnected then connected after the server-side Freqtrade WebSocket is established.
- Interactions verified: navigation, live pair switching, empty history state, and the reversible lifecycle transition `RUNNING → PAUSED → RUNNING`.
- Automated verification: TypeScript, 7 unit tests, production build, and Compose configuration all passed.
- Environment note: Binance US REST and the dashboard realtime channel work; the local network still times out on Binance market-data WebSockets, so Freqtrade falls back to its normal REST refresh path while remaining `RUNNING`.

Screenshots:

- `design-qa-dashboard.png`
- `design-qa-mobile.png`
- `output/playwright/real-integration/dashboard-real-desktop.png`
- `output/playwright/real-integration/chart-real-final.png`
- `output/playwright/real-integration/dashboard-real-mobile-final.png`
- `output/playwright/real-integration/chart-real-mobile-final.png`

## Final result

final result: passed
