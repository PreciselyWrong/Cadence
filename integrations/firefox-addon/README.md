# Cadence links for Firefox

Saves the current page or a link to your Cadence server, through `POST /api/links`. The AI Bookmark Tagger add-on stays separate: this one holds no AI and no bookmarks of its own.

- Toolbar button: title, status, tags and note, then save.
- Right click on a page or a link: saved in one click, the button shows a mark.
- Settings: the server address and an API token (Cadence: Profile › API tokens). The add-on asks for access to that server only, and reads no page beyond the tab you save.

```bash
node --test integrations/firefox-addon/test/core.test.js
npx web-ext lint --source-dir integrations/firefox-addon
npx web-ext build --source-dir integrations/firefox-addon --artifacts-dir /tmp/cadence-addon
```

To try it: `about:debugging` › This Firefox › Load Temporary Add-on › `manifest.json`. A permanent install needs the package signed by Mozilla (`web-ext sign`, unlisted, with your own AMO keys).
