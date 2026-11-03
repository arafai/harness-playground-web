# harness-playground-web

The web playground for live epic runs of ai-harness: the `web` platform, next to `arafai/harness-playground` as the `api` platform.

`npm start` serves one page on `PORT` (default 3000) that previews a slug.
The page calls `/api/slug`, which the server forwards to the api platform at `HARNESS_TARGET_API_URL` (set by acceptance runs), or `API_URL` for local use.
