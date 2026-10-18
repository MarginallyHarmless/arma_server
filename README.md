# SpearHead Server Watch — web edition

A static dashboard for **[EU6] SpearHead CORE KUKAs EVERON**, ready for GitHub Pages. No Windows app, build dependencies, API key or database is needed for the frontend.

## What is ready

- Player count, total queue, capacity, current scenario artwork, platforms and mod count.
- Population charts for 6 hours, 24 hours and 7 days, where the API has coverage.
- Queue alerts, optional sound and browser notifications.
- **Status checks every 60 seconds while the page is visible.** Overdue checks run when you return to the tab. Browsers can suspend background pages, so this is not a guaranteed background timer. Slow requests, service failures and rate limits delay checks.
- API history refreshes at most every 5 minutes per selected range. It is separate from the 60-second player/queue checks and remains at the provider's bucket resolution.
- Server discovery on every status check follows the exact EU6 name prefix, rather than pinning an IP address. Multiple current matches pause monitoring. If the server changes its name, update `FAVORITE` in `src/core.js` and the matching constant in `proxy/worker.js`.

## Deployment status and browser access

The dashboard is live at **https://marginallyharmless.github.io/arma_server/** and reads real server data through `https://spearhead-watch-api.bogdandraghici024.workers.dev/v2/`. Live player and queue counts, scenario details and 24-hour population history were verified on 18 October 2026. All 20 automated checks pass.

The proxy is a small serverless function deployed in the owner's Cloudflare account, separately from GitHub Pages. It does not need a rented VPS, Windows PC or always-running process. It relays public API responses; it does not run a minute-by-minute background collector or send alerts after the tab closes. Direct browser requests failed in testing; the configured proxy resolves that connection.

## Publish on GitHub Pages

1. Use the public repository [MarginallyHarmless/arma_server](https://github.com/MarginallyHarmless/arma_server).
2. Upload the **contents** of this folder to the root of the repository's `main` branch, including `.github/workflows/pages.yml`. Do not upload the containing ZIP itself. No personal history or credentials are included.
3. Open the repository's **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Open **Actions → Deploy server watch to GitHub Pages → Run workflow**. The workflow runs the checks, prepares the static files and deploys them.
5. The published address for this repository is `https://marginallyharmless.github.io/arma_server/`.
6. Open the page. Successful monitoring shows a timestamped source reading. If it shows a connection issue, use the proxy steps below.

The workflow runs on pushes and manual requests. It does **not** use scheduled GitHub Actions to poll the game server. GitHub's scheduled workflows have a minimum five-minute interval and are not a one-minute collector.

## Redeploy or move the proxy

1. The current Worker is named `spearhead-watch-api`. Open it in Cloudflare's **Workers & Pages**, or create a new Worker in your own account if moving the deployment.
2. Replace its example script with the full contents of `proxy/worker.js`.
3. Add the plain-text environment variable `ALLOWED_ORIGIN` with value `https://marginallyharmless.github.io` (no repository path and no trailing slash). If you use a custom domain, use that origin instead. Save and deploy the Worker.
4. Copy the HTTPS Worker address. In this repository's `config.js`, replace `apiBase` with that address followed by `/v2/`, for example `https://spearhead-watch-api.YOUR-SUBDOMAIN.workers.dev/v2/`.
5. Commit the change. GitHub Actions redeploys the dashboard. Reload the page and confirm that current player and queue counts load.

Alternatively, if you already use Cloudflare's Wrangler CLI, the included `proxy/wrangler.toml` is ready for your own account. Deploy from the `proxy` folder after authenticating. Never commit tokens or `.dev.vars`.

The Worker accepts only GET requests for the app's required public Reforger Mods API routes, validates its search and history parameters, limits browser access to `ALLOWED_ORIGIN`, and omits credentials. Origin checks are browser access controls, not authentication; the endpoint still serves public information. For a widely shared site, review the provider's shared-IP request limits and Cloudflare usage before expanding it.

## Using the dashboard

- Keep the tab open for local alerts. Under **Queue alerts**, check **Enabled**, choose a threshold, and optionally enable sound. Browser notifications need an explicit permission grant using the notification button. In-page alerts still work if permission is denied.
- An alert fires when the queue reaches the threshold. It rearms after fresh data rises above it and has a 10-minute cooldown within that visit. A zero queue requires a known open player slot. Unknown, stale or offline readings do not trigger alerts.
- **Refresh** makes an extra check, limited to once per 10 seconds and subject to the service's retry window.
- The server details expand to show address, region, version, server FPS, session ID and provider-estimated average wait per queue position, when supplied. That wait figure is not a guarantee of your total queue time.
- To view the design without live requests, add `?demo=1` to the address. The banner explicitly labels all values as example data. Demo mode does not save data or send alerts.

## History continuity

Provider history may not follow a newly assigned API server ID. The app clears remote history caches when that ID changes and never joins disconnected local segments across IDs. The favorite's local history remains stored under its name-based key.

## Privacy and storage

Preferences and up to 7 days of local player samples stay in this browser's local storage. They are not uploaded to GitHub or synced across devices. Clearing site data removes them. If storage is blocked, monitoring works for the current visit and shows a storage notice.

The browser contacts the public API (or your configured proxy) and Bohemia Interactive's CDN for scenario artwork. No analytics, advertising, external JavaScript dependencies, credentials or private player data are included. The map card shows scenario artwork supplied by the API, which may be a logo rather than a geographic map.

## Local development

Requires Node.js 22+ for the checks and build. No `npm install` is needed.

```sh
npm test
npm run build
python -m http.server 8767 --directory dist
```

Open `http://localhost:8767/?demo=1` for the local design preview. The production proxy allows the published GitHub Pages origin only. For local live integration, use a separate development Worker with `ALLOWED_ORIGIN=http://localhost:8767` and a local `config.js` override. Use an HTTP server; opening `index.html` as a `file://` URL will not load the JavaScript modules correctly.

`dist/` contains only the deployable frontend. `proxy/` is deployed separately. The test suite uses deterministic responses and does not contact the game server. See `VALIDATION.md` for completed checks and remaining deployment verification.

## References

- [Reforger Mods API](https://reforgermods.net/arma-reforger-mods-api/)
- [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub scheduled workflow limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Browser background throttling](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Cloudflare Worker CORS example](https://developers.cloudflare.com/workers/examples/cors-header-proxy/)
