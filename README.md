# usdt-toman-bot

Sends the current USDT price in Toman (and the 18k gold price per gram) to a Telegram channel, once per hour, via a GitHub Actions cron job.

## How it works

[fetch-price.js](fetch-price.js):

1. Fetches the USDT/Toman price from the [Nobitex](https://nobitex.ir) public API, converting the latest Rial price to Toman (`rial / 10`).
2. If Nobitex fails, falls back to the [Wallex](https://wallex.ir) `USDTTMN` market.
3. Fetches the 18k gold price per gram by scraping [tgju.org](https://www.tgju.org/profile/geram18) (optional — a failure here doesn't block the USDT report).
4. Posts a compact message to a Telegram chat/channel using the Bot API, with USDT and gold each on a single line so both show in the notification preview.

[.github/workflows/fetch-price.yml](.github/workflows/fetch-price.yml) runs the script on Node 22:

- On a schedule: `0 * * * *` (every hour).
- Manually via `workflow_dispatch`.

## Setup

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather) and get its token.
2. Add the bot as an admin to your target channel (or use a chat ID).
3. In the GitHub repo, add these **Actions secrets**:

   | Secret | Description |
   | --- | --- |
   | `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
   | `TELEGRAM_CHAT_ID` | Target channel username (e.g. `@mychannel`) or numeric chat ID |

That's it — the workflow will start posting on the next scheduled run.

## Running locally

Requires Node.js 18+ (uses the built-in `fetch`).

```bash
TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_CHAT_ID=xxxx node fetch-price.js
```

## Message format

```
💵 USDT: 97,850 Toman
🥇 Gold 18k: 7,890,123 Toman/g
```

The gold line is omitted if the gold price can't be fetched.
