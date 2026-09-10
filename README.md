# usdt-toman-bot

Sends the current USDT price in Toman to a Telegram channel, once per hour, via a GitHub Actions cron job.

## How it works

[fetch-price.js](fetch-price.js):

1. Fetches the `usdt-rls` market stats from the [Nobitex](https://nobitex.ir) public API.
2. Converts the latest Rial price to Toman (`rial / 10`).
3. Posts a message to a Telegram chat/channel using the Bot API, including a Tehran-time timestamp.

[.github/workflows/fetch-price.yml](.github/workflows/fetch-price.yml) runs the script on Node 20:

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
💵 USDT/Toman

97,850 Toman

🕒 9/10/2026, 6:00:00 PM
```
