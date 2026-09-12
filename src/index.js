// This Worker does NOT fetch prices itself. Nobitex/Wallex block requests
// coming from Cloudflare's IP ranges (their WAF/anti-bot layer), so the
// actual fetching still runs on a GitHub Actions runner, where it works.
//
// Instead, this Worker's only job is to fire reliably on a Cron Trigger
// and tell GitHub, via the Actions API, to run that workflow right now —
// trading GitHub's imprecise built-in `schedule:` cron for Cloudflare's
// precise one, while keeping the actual network calls on GitHub's runners.

// Ask GitHub to run the fetch-price workflow via workflow_dispatch
async function dispatchWorkflow(env) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_WORKFLOW_FILE } = env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO || !GITHUB_WORKFLOW_FILE) {
    throw new Error(
      "GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO / GITHUB_WORKFLOW_FILE are not configured",
    );
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/vnd.github+json",
      authorization: `Bearer ${GITHUB_TOKEN}`,
      "user-agent": "usdt-toman-bot-worker",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (res.status !== 204) {
    const body = await res.text();
    throw new Error(`GitHub dispatch failed: ${res.status} ${body}`);
  }
}

export default {
  // Runs on the Cron Trigger defined in wrangler.toml
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      dispatchWorkflow(env).catch((err) => {
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
      await dispatchWorkflow(env);
      return Response.json({ ok: true, dispatched: true });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};
