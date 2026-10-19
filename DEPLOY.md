# Deployment

Everything in this repo is deploy-ready. The only missing input is **your
credentials** — none exist in the build sandbox, and none should be pasted into
a chat window.

## Option A — Vercel via CLI (fastest)

```bash
cd omega-synapse-repo
npx vercel login          # browser auth, one time
npx vercel --prod         # deploys, prints the production URL
```

First run asks: link to existing project? → **N**. Framework preset → **Other**.
It reads `vercel.json` and deploys `api/index.py` as a Python serverless function.

Expected output ends with:

```
Production: https://<project>.vercel.app
```

## Option B — GitHub, then Vercel Git integration

```bash
cd omega-synapse-repo
git remote add origin https://github.com/<you>/omega-synapse.git
git push -u origin main
```

Then vercel.com → Add New → Project → import the repo → Deploy.
No environment variables required; the app has no secrets.

## Option C — Arena Vercel connector

The Vercel connector is available in this workspace but currently **disconnected**.
Enable it in the connectors panel and I can deploy from here in one step.

## Post-deploy verification

Run these against the live URL. Anything other than the expected output means
the deploy is not done.

```bash
BASE="https://<project>.vercel.app"
curl -s $BASE/api/health
# {"status":"HEALTHY","mode":"read-only","live_gate":"NO","position_cap":0,
#  "execution_path":"ABSENT","runtime":"vercel-serverless"}

curl -s -o /dev/null -w "%{http_code}\n" $BASE/            # 200
curl -s -X POST -o /dev/null -w "%{http_code}\n" $BASE/    # 405
```

## Notes / known constraints

* **Cold start** recomputes from Kraken (~3-4 s). Warm invocations serve a
  5-minute memo. `maxDuration` is 60 s in `vercel.json`.
* **SQLite cache** points at `/tmp` under serverless (read-only FS elsewhere).
  That cache is per-instance and disposable — it is an optimisation, never a
  source of truth.
* **Geyser** stays `BLOCKED_ON_CREDENTIALS` until `GEYSER_ENDPOINT` and
  `GEYSER_TOKEN` are set. Public RPC is deliberately not substituted: the
  latency profile is a different class and the miss rate on new mints is high.
* **No POST route exists**, so the deployed surface cannot be triggered into
  doing work. Re-running the screener is a CLI action by design.

## Rollback

`npx vercel rollback` (CLI) or promote the previous deployment in the dashboard.
Nothing here holds state, so rollback is total and safe.
