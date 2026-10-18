# Validation — 18 October 2026

## Completed

- 27 deterministic Node checks pass. Coverage includes identity discovery, changing server IDs/IPs, missing and zero counts, fractional source age, stale readings, history parsing, restart evidence, session changes, alert hysteresis and cooldown, retry windows and proxy route/header restrictions.
- Static build produces a dependency-free frontend in `dist/`.
- Desktop dashboard inspected in the browser using explicitly labelled example data; scenario artwork loaded from the API's supplied Bohemia CDN URL.
- Phone layout inspected in a 390-pixel frame. The content viewport was 375 pixels after its scrollbar; document width and scroll width matched. Chart labels remained readable and range controls worked without horizontal overflow.
- 6-hour and 7-day range controls updated the chart and selected state.
- A labelled local API fixture exercised the real data-loading path: server discovery, detail fetch, population history, restart estimate, counts and an in-page queue alert. It did not send any real game-server notification.
- The real browser refresh loop made two automatic status/discovery requests **60.007 seconds apart** against that fixture. History was fetched once and reused during the next minute's status check. No manual refresh was used between the two readings.
- Live connection failure showed unknown values, an explanation and a retry countdown, rather than treating unavailable data as zero.
- No personal history, credentials or generated user settings are included in this package.
- Source uploaded to the public repository `MarginallyHarmless/arma_server`; Pages configured to deploy through GitHub Actions.
- GitHub Actions run `39153069939`, attempt 2: all tests, build and Pages deployment succeeded. The first attempt preceded Pages activation and failed only at the configure-pages step.
- Published frontend loaded at `https://marginallyharmless.github.io/arma_server/`. Its API request returned a browser connection failure; no live population or queue reading is claimed.

## Deployment checks still required

- Deploy the supplied Cloudflare Worker and configure `apiBase`, then verify current API readings through it. Worker routing and header logic were tested locally; no Worker has been deployed. Automatic approval review blocked opening the separate Cloudflare account without explicit authorization.
- OS notification delivery and audible sound depend on the user's permission and browser. The in-page queue alert was verified; system permission was not requested during testing.

Example and fixture values are synthetic. They are not a report of current server population. API responses themselves were reachable through direct browser navigation, but webpage requests were unsuccessful from both localhost and GitHub Pages. Frontend hosting is verified; live data connectivity and closed-tab collection are not claimed.
