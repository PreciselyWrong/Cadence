# Screenshots and project page

The README screenshots (`screenshots/web/`, `screenshots/android/`) and the project page (`site/`) come from one fictional demo account, so they can be redone after a UI change.

## Demo data

`npm run db:seed:screenshots` (or `cd backend && DB_FILE=db/shots.sqlite3 node seeders/screenshots-seeder.js`) creates or resets the account `demo@cadence.test` / `demodemo` (Sam Carter, English, Europe/Paris) and prints an API key. Dates are relative to the run, so run it the same day as the captures. It fills areas, projects with a timeline and blocks, tasks, today's plan, Cadence habits with 45 days of entries, outline notes with links, goals, people, focus sessions, mail and decision cards. Public screenshots and demo data are always in English, a single language (no bilingual dataset). Everything is invented; keep it that way (no real names, addresses or domains other than `example.com`).

## Web

1. Start a throwaway pair: `shots-backend` (port 3312, `db/shots.sqlite3`) and `shots-web` (port 4180) from `.claude/launch.json`, or the same commands by hand.
2. `node scripts/screenshots/web.js` writes `screenshots/web/*.png` (1440 × 900 at 2×, English `en-US`, light; `today-dark` in dark). Name shots to redo only those: `node scripts/screenshots/web.js today plan`. The page clock is frozen at 10:20 so the calendars show the working day.
3. `optipng -o2 screenshots/web/*.png`.

## Wiki

`node scripts/screenshots/web.js --wiki` takes the wiki set (`WIKI_SHOTS`) into `wiki/images/`, on the same demo account and server pair; name shots to redo only those. For `todo-md-link`, start the backend with `CADENCE_TODO_ROOT` pointing at a throwaway folder of two or three sub-folders holding a sample `TODO.md` (for example `spring-marathon`, `site-redesign` and `brittany-trip` under `~/.cache/cadence-shots-todos/`, set with `CADENCE_TODO_ROOT`). A full run sends more than the default 100 API requests per 15 minutes and signs in more than the 5 allowed per window: start the backend with `RATE_LIMIT_API_MAX=10000 RATE_LIMIT_AUTH_MAX=10000`. `scripts/publish-wiki.sh` publishes the pages and the images (wiki/README.md).

## Android

On the emulator (never on a phone with real data):

1. Install the debug APK, then Réglages › Compte Cadence: server `http://10.0.2.2:3312`, the printed API key, « Synchroniser maintenant ».
2. Freeze the look: `adb root`, `adb shell settings put global auto_time 0`, `adb shell date MMDDhhmmYYYY.ss` (10:20 today), gesture navigation (`cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural`) and the System UI demo mode (`am broadcast -a com.android.systemui.demo -e command enter`, then `clock -e hhmm 1020`, full battery and Wi-Fi, notifications hidden).
3. `adb exec-out screencap -p > screenshots/android/<name>.png` for Today, Planifier, Agenda (Jour), Habitudes, a task sheet and Bilan, then `optipng -o2`.

## Project page

`site/index.html` is one static page; `site/build.sh` assembles it in `_site/` with the screenshots, the logo and the Inter font it shares with the web app. `.github/workflows/pages.yml` publishes it to GitHub Pages on each push to `main` that touches `site/` or `screenshots/` (Settings › Pages › Source: GitHub Actions, once).
