# Maintaining the wiki

The wiki lives in the repository, next to the code it describes, so a feature and its page change in the same commit.

## Where the files are

| What | Where |
| --- | --- |
| Pages | `wiki/<Page-Title>.md` (internal link: `[text](Page-Title)`) |
| Sidebar and footer | `wiki/_Sidebar.md`, `wiki/_Footer.md` |
| Wiki screenshots | `wiki/images/<name>.png` |
| README screenshots, reused | `screenshots/web/*.png`, published under `images/web/` |
| Technical detail | `docs/` (the wiki links to it without copying it) |

## When to update a page

- A visible feature is added, removed, or changes behaviour, label, delay or limit.
- A new edge case is found (conflict, offline, deletion).
- A screenshot no longer matches the screen.

A new page is also added to `wiki/_Sidebar.md` and `wiki/Home.md`.

## Retaking screenshots

Screenshots come from the made-up demo account (`npm run db:seed:screenshots`), on a throwaway server pair (ports 3312 and 4180):

```bash
node scripts/screenshots/web.js --wiki
```

Name the shots to retake only those: `node scripts/screenshots/web.js --wiki palette inbox`. Full procedure: [docs/fork/SCREENSHOTS.md](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/SCREENSHOTS.md).

## Publishing

```bash
scripts/publish-wiki.sh
```

`scripts/publish-prod.sh` runs it on every production release; it can also run on its own. It copies `wiki/` and the README screenshots into the GitHub wiki repository, commits and pushes, and removes pages deleted from `wiki/`. `--plan` shows what it would do. An edit made directly on GitHub is overwritten by the next publish.

## Writing rules

- In English, for a user: what it does, how to use it, what happens in edge cases.
- Quote the interface labels from `public/locales/en/` (the Android app is French only: give the French label with its meaning).
- Made-up data only (`example.com`), no real path, host or name: the repository is public.
