# Binance Spot Bot Workspace

This repository keeps the complete workspace in one place:

- Freqtrade core and its upstream history
- `user_data/strategies/SimpleSpot.py` for the current spot strategy
- `user_data/config.us.example.json` as a secret-free Binance US dry-run template
- `dashboard/` for the responsive operations dashboard
- `deploy/` for deployment-specific configuration

## Resume on another machine

```powershell
git clone https://github.com/coylin-zy/binance-bot.git
cd binance-bot
Copy-Item user_data/config.us.example.json user_data/config.us.json
Copy-Item dashboard/.env.example dashboard/.env.local
```

Replace every `CHANGE_ME` value locally. Keep `user_data/config.us.json`,
`dashboard/.env.local`, cookies, databases, and logs out of Git.

Start Freqtrade from the repository root:

```powershell
$env:FREQTRADE_WS_TOKEN = '<same websocket token as config.us.json>'
docker compose up -d freqtrade
```

Start the dashboard from its directory:

```powershell
cd dashboard
$env:FREQTRADE_WS_TOKEN = '<same websocket token as config.us.json>'
docker compose up -d --build
```

The dashboard joins the root Compose network and communicates with Freqtrade
internally. Do not expose the Freqtrade API port publicly.
