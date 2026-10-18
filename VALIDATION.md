# Validation — 18 October 2026

## Completed

- Replaced promotional copy with the server name and functional labels. Removed decorative section captions and the footer slogan, shortened status/help text, and reduced header spacing.

- Removed the restart estimate and scenario-change alerts at the owner's request. Their inference logic, saved settings and obsolete tests were removed; population history now fetches only the selected range.

- 20 deterministic Node checks pass. Coverage includes identity discovery, changing server IDs/IPs, missing and zero counts, fractional source age, stale readings, history parsing, alert hysteresis and cooldown, retry windows and proxy route/header restrictions, including rejecting upstream redirects.
- Static build produces a dependency-free frontend in `dist/`.
- Desktop dashboard inspected in the browser using explicitly labelled example data; scenario artwork loaded from the API's supplied Bohemia CDN URL.
- Phone layout inspected in a 390-pixel frame. The content viewport was 375 pixels after its scrollbar; document width and scroll width matched. Chart labels remained readable and range controls worked without horizontal overflow.
- 6-hour and 7-day range controls updated the chart and selected state.
- A labelled local API fixture exercised the real data-loading path: server discovery, detail fetch, population history, counts and an in-page queue alert. It did not send any real game-server notification.
- The real browser refresh loop made two automatic status/discovery requests **60.007 seconds apart** against that fixture. History was fetched once and reused during the next minute's status check. No manual refresh was used between the two readings.
- Live connection failure showed unknown values, an explanation and a retry countdown, rather than treating unavailable data as zero.
- No personal history, credentials or generated user settings are included in this package.
- Source uploaded to the public repository `MarginallyHarmless/arma_server`; Pages configured to deploy through GitHub Actions.
- GitHub Actions run `39153069939`, attempt 2: all tests, build and Pages deployment succeeded. The first attempt preceded Pages activation and failed only at the configure-pages step.
- Cloudflare Worker `spearhead-watch-api.bogdandraghici024.workers.dev` deployed with `ALLOWED_ORIGIN=https://marginallyharmless.github.io`. Configuration update passed GitHub Actions run `39154357077` and deployed to Pages.
- Fixed a deployed-runtime incompatibility: Workers rejects `redirect: 'error'`; the relay now uses `manual` and explicitly rejects redirect responses without following or forwarding their Location header.
- Published frontend loaded real data through the proxy: at approximately 21:33 Europe/Bucharest, 128/128 players, queue 27/50, 147 mods, current scenario `SH_Kuka's_Everon_II`, server address, FPS and session ID. The 24-hour chart contained 288 five-minute readings.
- Live API schema inspection identified `gameVersion` and `supportedClients`; these are normalized for the detail and platform displays. The scenario mode label also accepts the provider's campaign localization key.

## Deployment checks still required

- OS notification delivery and audible sound depend on the user's permission and browser. The in-page queue alert was verified; system permission was not requested during testing.

Example and fixture values are synthetic. Live observations above are timestamped verification snapshots, not permanently current counts. Both frontend hosting and live proxy connectivity are verified. No closed-tab collection is claimed.
