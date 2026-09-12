// Get USDT/Toman price from Nobitex
async function getPriceFromNobitex() {
  const res = await fetch("https://api.nobitex.ir/market/stats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ srcCurrency: "usdt", dstCurrency: "rls" }),
  });
  if (!res.ok) throw new Error(`Nobitex error: ${res.status}`);

  const data = await res.json();
  const stat = data.stats["usdt-rls"];
  if (!stat) throw new Error("usdt-rls pair not found in response");

  const rial = Number(stat.latest);
  if (!rial) throw new Error("Nobitex returned an invalid price");

  return Math.round(rial / 10);
}

// Fallback: get USDT/Toman price from Wallex
async function getPriceFromWallex() {
  const res = await fetch("https://api.wallex.ir/v1/markets");
  if (!res.ok) throw new Error(`Wallex error: ${res.status}`);

  const data = await res.json();
  const symbol = data?.result?.symbols?.USDTTMN;
  if (!symbol) throw new Error("USDTTMN pair not found in response");

  const toman = Number(symbol.stats?.lastPrice);
  if (!toman) throw new Error("Wallex returned an invalid price");

  return Math.round(toman);
}

// Get 18 karat gold price (Toman per gram) by scraping tgju.org
async function getGold18Price() {
  const res = await fetch("https://www.tgju.org/profile/geram18", {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CurrencyPriceService/1.1)",
    },
  });
  if (!res.ok) throw new Error(`tgju error: ${res.status}`);

  const html = await res.text();
  if (!html) throw new Error("tgju returned an empty response");

  const match = html.match(
    /data-col=["']info\.last_trade\.PDrCotVal["'][^>]*>([^<]+)</,
  );
  if (!match) throw new Error("gold price node not found in response");

  const rial = Number(match[1].replace(/[,\s]/g, ""));
  if (!rial) throw new Error("tgju returned an invalid price");

  return Math.round(rial / 10);
}

// Fetch both prices and post the report to Telegram
async function report(env) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not configured");
  }

  // 1. Get USDT/Toman price, falling back to Wallex if Nobitex fails
  let toman;
  let source;
  try {
    toman = await getPriceFromNobitex();
    source = "Nobitex";
  } catch (err) {
    console.error(`Nobitex failed, trying Wallex: ${err.message}`);
    toman = await getPriceFromWallex();
    source = "Wallex";
  }

  // 2. Get 18 karat gold price (optional — don't block the USDT report if it fails)
  let gold18;
  try {
    gold18 = await getGold18Price();
  } catch (err) {
    console.error(`Gold 18k fetch failed: ${err.message}`);
  }

  let message = `💵 USDT: ${toman.toLocaleString("en-US")} Toman`;
  if (gold18) {
    message += `\n🥇 Gold 18k: ${gold18.toLocaleString("en-US")} Toman/g`;
  }

  // 3. Send to Telegram channel
  const tgRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
    },
  );

  if (!tgRes.ok) {
    const err = await tgRes.text();
    throw new Error(`Telegram error: ${err}`);
  }

  console.log(`Sent: ${toman} Toman (${source})`);
  return { toman, gold18, source };
}

export default {
  // Runs on the Cron Trigger defined in wrangler.toml
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      report(env).catch((err) => {
        console.error(err);
        throw err; // surfaces as a failed cron invocation in the dashboard
      }),
    );
  },

  // Manual trigger for testing: GET /run?key=<TRIGGER_SECRET>
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run") {
      return new Response("usdt-toman-bot — try GET /run?key=...", {
        status: 404,
      });
    }
    if (!env.TRIGGER_SECRET || url.searchParams.get("key") !== env.TRIGGER_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const result = await report(env);
      return Response.json({ ok: true, ...result });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};
