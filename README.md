# usdt-toman-bot

Sends the current USDT price in Toman (and the 18k gold price per gram) to a Telegram channel, once per hour.

## Architecture

Two pieces, on purpose:

1. **[fetch-price.js](fetch-price.js) on GitHub Actions** does the actual work — fetches prices and posts to Telegram. It only runs via `workflow_dispatch` ([.github/workflows/fetch-price.yml](.github/workflows/fetch-price.yml)), never on GitHub's own `schedule:` cron.
2. **[src/index.js](src/index.js) on Cloudflare Workers** does nothing but fire reliably on an hourly Cron Trigger and call GitHub's API to trigger that `workflow_dispatch`.

Why split it this way: GitHub's built-in cron scheduler is imprecise and can skip or delay runs on public repos — that's what Cloudflare's Cron Trigger fixes. But Nobitex and Wallex's anti-bot/WAF layer blocks requests originating from Cloudflare's IP ranges, so the price-fetching itself has to keep running from GitHub's runners, where it isn't blocked. The Worker is just a reliable "press the button" for GitHub Actions.

## Repo mirroring

This project lives on both GitLab (`origin`, hosts the Cloudflare deploy pipeline in [.gitlab-ci.yml](.gitlab-ci.yml)) and GitHub (`github`, hosts the Actions workflow that GitHub Actions itself needs to run). `origin` is configured with two push URLs, so a single push updates both:

```bash
git push origin main
```

To re-create this setup elsewhere:

```bash
git remote set-url --push origin <gitlab-url>
git remote set-url --add --push origin <github-url>
```

### fetch-price.js (runs on GitHub Actions)

1. Fetches the USDT/Toman price from the [Nobitex](https://nobitex.ir) public API, converting the latest Rial price to Toman (`rial / 10`).
2. If Nobitex fails, falls back to the [Wallex](https://wallex.ir) `USDTTMN` market.
3. Fetches the 18k gold price per gram by scraping [tgju.org](https://www.tgju.org/profile/geram18) (optional — a failure here doesn't block the USDT report).
4. Posts a compact message to a Telegram chat/channel using the Bot API.

### src/index.js (runs on Cloudflare Workers)

- `scheduled` — fired by the Cron Trigger in [wrangler.toml](wrangler.toml): `*/15 * * * *` (every 15 minutes, UTC). It only actually dispatches if more than ~50 minutes have passed since the last successful dispatch, tracked in the `LAST_RUN` KV namespace. Cloudflare's Cron Trigger has been observed to silently skip firing for hours at a time with no error logged — ticking every 15 minutes and gating on KV means a skipped tick self-heals on the next one instead of causing a multi-hour gap. Calls `POST /repos/{owner}/{repo}/actions/workflows/fetch-price.yml/dispatches`.
- `fetch` — `GET /run?key=<TRIGGER_SECRET>` triggers a dispatch on demand, bypassing the KV guard, for testing. Returns 401 without the right key, and is disabled entirely if `TRIGGER_SECRET` isn't set.

## Setup

### 1. GitHub Actions side

1. Create a Telegram bot with [@BotFather](https://t.me/BotFather) and get its token.
2. Add the bot as an admin to your target channel (or use a chat ID).
3. In the GitHub repo ([RezaTabrizii/usdt-toman-bot](https://github.com/RezaTabrizii/usdt-toman-bot)), add these **Actions secrets** (Settings → Secrets and variables → Actions):

   | Secret | Description |
   | --- | --- |
   | `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
   | `TELEGRAM_CHAT_ID` | Target channel username (e.g. `@mychannel`) or numeric chat ID |

### 2. Cloudflare Worker side

1. Install dependencies and log in:

   ```bash
   npm install
   npx wrangler login
   ```

2. Create a GitHub **fine-grained personal access token**, scoped to just this repo, with **Actions: Read and write** permission (needed to call `workflow_dispatch`): https://github.com/settings/tokens

3. Set the Worker secrets:

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put TRIGGER_SECRET   # optional, for the manual /run endpoint
   ```

   | Secret | Description |
   | --- | --- |
   | `GITHUB_TOKEN` | Fine-grained PAT scoped to the repo, "Actions: Read and write" |
   | `TRIGGER_SECRET` | Random string guarding `GET /run` (optional) |

   The repo owner/name/workflow filename are non-secret and already set in [wrangler.toml](wrangler.toml) under `[vars]` — update those if the repo ever moves.

4. Deploy:

   ```bash
   npm run deploy
   ```

The Cron Trigger is registered as part of the deploy — no extra dashboard step.

## Running locally

**The Worker (dispatcher):**

```bash
cp .dev.vars.example .dev.vars   # fill in your GITHUB_TOKEN; .dev.vars is gitignored
npm run dev
```

Then trigger it by hand:

- The scheduled handler: `curl "http://localhost:8787/cdn-cgi/handler/scheduled"`
- The HTTP handler: `curl "http://localhost:8787/run?key=<TRIGGER_SECRET>"`

Note: local `wrangler dev` (without `--remote`) runs in a sandbox that can itself have flaky outbound networking — use `npx wrangler dev --remote` to test against Cloudflare's real edge, or just test the deployed Worker directly (see below).

**fetch-price.js (the actual fetch/send job):**

```bash
TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_CHAT_ID=xxxx node fetch-price.js
```

## Testing production

```bash
curl "https://usdt-toman-bot.<your-subdomain>.workers.dev/run?key=<TRIGGER_SECRET>"
```

This calls the same `dispatchWorkflow()` the cron uses. Check the **Actions** tab on the GitHub repo to confirm a new `workflow_dispatch` run started, and watch `npx wrangler tail` for the Worker-side logs.

## Logs

- Worker: `npx wrangler tail`, or **Workers & Pages → usdt-toman-bot → Settings → Trigger Events** in the Cloudflare dashboard.
- Actual fetch/send job: the **Actions** tab on the GitHub repo.

## Message format

```
💵 USDT: 97,850 Toman
🥇 Gold 18k: 7,890,123 Toman/g
```

The gold line is omitted if the gold price can't be fetched.
