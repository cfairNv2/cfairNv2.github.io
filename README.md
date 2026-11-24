# Nv2 Leaderboards

Home: https://cfairnv2.github.io/home

HTML entry points for the short page addresses. App, styling, images and updated leaderboard files are shared from https://github.com/cfairNv2/nv2-metanet-records.

## Level Data

The User levels search area links to `/userlevel/level-data/`. The standalone
page accepts exactly six digits and displays a read-only N v2 import string
with a copy button. It is not linked from Home or the Metanet section.
The URL is public; limiting navigation links is not access control.

`level-data-link.js` adds the link and follows the shared app's route changes.
`level-data.css` supplies only the new feature's styles; the existing gray
palette, font, white text box and copy-button styles come from the shared site.
The standalone page does not load leaderboard data.

The Cloudflare Worker in `worker/index.mjs` retrieves one original game file
from `https://s3.amazonaws.com/bucket.thewayoftheninja.org/<six digits>.txt`.
It decodes base64 and zlib, reads the Flash UTF-8 title, validates the tile and
entity records, and writes N v2's low-hex-digit-first `%title#map#` format.
Title `#` characters become fullwidth `＃` so the two import delimiters remain
unambiguous. Newlines in titles become spaces. Map bytes are preserved.
The protocol was inspected in the original ActionScript exposed by
[this source-level port](https://github.com/a-n-d-a-i/n/tree/main/extract/scripts/scripts):
`RootURLS.as`, `AmazonServerConnector.as`, `Editor_State.as`, `edat.as` and
`sim_globals.as`. The example 452053 was fetched from the original storage
and decodes to `signatural`. The PHP tool's server source was not available.
No runtime code calls tools.droni.es, the leaderboard updater or private R2 data.

Live endpoint: `https://nv2-level-data.cfair-v2-github-io.workers.dev/level-data?l=452053`

GitHub Pages serves the page; Cloudflare runs only the lookup. The original
storage does not send the CORS headers needed for a browser fetch. The Worker
allows this site's origin, uses a fixed upstream, limits file sizes and request
time, and caches successful responses for five minutes. Errors are not cached.
No database, storage bindings or game-account credentials are required.

### Development and deployment

Use Node 24 or later and pnpm. Install with `pnpm install`, then run `pnpm test`.
The tests use a small original-file fixture and synthetic files, with no network
or Cloudflare account required.

1. Sign in with `pnpm exec wrangler login`.
2. Validate with `pnpm exec wrangler deploy --dry-run`.
3. Deploy with `pnpm run deploy:worker` using the intended Cloudflare account.
4. Set `window.NV2_LEVEL_DATA_ENDPOINT` in `level-data-config.js` to the deployed
   HTTPS Worker URL followed by `/level-data`.
5. Publish the repository's root to GitHub Pages, as before.

Only the public endpoint belongs in the configuration file. Never commit
Cloudflare tokens or `.dev.vars`. The Worker is independent of the existing
Cloudflare R2 baseline and does not need access to it.
