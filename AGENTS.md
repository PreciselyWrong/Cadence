# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot…) live in [CLAUDE.md](CLAUDE.md). Read it first, in particular the section **"This Fork (PreciselyWrong/tududi)"**:

- keep the README section "🍴 What this fork adds" and the fork feature table in CLAUDE.md up to date with every fork change;
- update the matching `docs/*.md` page with every behaviour change;
- add every new UI string to all 26 `public/locales/*/translation.json` files;
- give each migration a unique timestamp and check the upgrade path on SQLite and PostgreSQL;
- run the full checks (backend tests, frontend tests, typecheck, lint, build) before pushing;
- use TickTick as a behaviour reference only, never copy its code, assets or texts.
