# Wiki source

These pages are the source of the [GitHub wiki](https://github.com/PreciselyWrong/cadence/wiki). Edit them here, in the same commit as the feature, then `scripts/publish-wiki.sh` publishes them. Do not edit the wiki on GitHub: the next publish overwrites it.

- One page per topic, in English, file name `Page-Title.md` (link: `[text](Page-Title)`).
- Screenshots: `images/<name>.png`, taken on the demo account by `node scripts/screenshots/web.js --wiki`; the README ones are published under `images/web/`.
- Technical detail stays in `docs/`: pages link to it with an absolute `https://github.com/PreciselyWrong/cadence/blob/main/docs/...` URL.
