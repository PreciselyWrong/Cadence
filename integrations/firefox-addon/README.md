# Cadence links for Firefox

Makes the current page or a link a Cadence task, through `POST /api/links/task` (the server names it « Essayer / Lire / Regarder : … » from the kind of page, `docs/37-links.md`). The AI Bookmark Tagger add-on stays separate: this one holds no AI and no bookmarks of its own.

- Toolbar button or Alt+Shift+K: the proposed task name (editable), « Déjà dans … » with Open when the page is already in an open task or a project (`GET /api/links/lookup`), then « Créer la tâche ».
- Right click on a page or a link: a task in one click, the button shows a mark.
- Settings: the server address and an API token (Cadence: Profile › API tokens). The add-on asks for access to that server only, and reads no page beyond the tab you save.

```bash
node --test integrations/firefox-addon/test/core.test.js
npx web-ext lint --source-dir integrations/firefox-addon
npx web-ext build --source-dir integrations/firefox-addon --artifacts-dir /tmp/cadence-addon
```

To try it: `about:debugging` › This Firefox › Load Temporary Add-on › `manifest.json`. A permanent install needs the package signed by Mozilla (`web-ext sign`, unlisted, with your own AMO keys).
