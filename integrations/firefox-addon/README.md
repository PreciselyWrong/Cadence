# Cadence links for Firefox

Makes the current page or a link a Cadence task, through `POST /api/links/task` (the server names it « Essayer / Lire / Regarder : … » from the kind of page, `docs/37-links.md`). The AI Bookmark Tagger add-on stays separate: this one holds no AI and no bookmarks of its own.

- Toolbar button or Alt+Shift+K: the proposed task name (editable), optional due date (« Aujourd'hui » / « Demain »), « Déjà dans … » with Open when the page is already in an open task or a project (`GET /api/links/lookup`), then « Créer la tâche ».
- Right click on a page or a link: a task in one click, the button shows a mark.
- Gmail: in the list, a « + » action beside Archive and Delete on each row (shown on hover, opens the panel without opening the mail); in an open message, a « + Cadence » button beside the subject opens a small panel over Gmail (name from the subject, « Aujourd'hui » / « Demain »); the task keeps the message address and the Gmail badge. The button speaks to the background, which holds the token (`gmail.js`).
- Project (in the popup): nothing is chosen until you pick a project; the task above always goes to none. « Envoyer au projet » adds the tab to a project's pages, « Envoyer le groupe » every tab of its tab group, « Ouvrir le projet » opens the project's pages in a tab group named like it (Firefox 139+).
- Settings: the server address and an API token (Cadence: Profile › API tokens). The add-on asks for access to that server only, and reads no page beyond the tab you save, except Gmail, where it adds its button.

```bash
node --test integrations/firefox-addon/test/core.test.js
npx web-ext lint --source-dir integrations/firefox-addon
npx web-ext build --source-dir integrations/firefox-addon --artifacts-dir /tmp/cadence-addon
```

To try it: `about:debugging` › This Firefox › Load Temporary Add-on › `manifest.json`. A permanent install needs the package signed by Mozilla, unlisted (private, never shown on addons.mozilla.org): `integrations/firefox-addon/sign.sh` with your AMO keys, then open the `.xpi` in Firefox. Raise `version` in `manifest.json` before each new signing.
