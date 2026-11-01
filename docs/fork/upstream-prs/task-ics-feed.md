# PR amont : flux .ics des tâches

Brouillon, rien n'est envoyé. Branche locale `upstream/task-ics-feed` (commit `20729181`), worktree `/home/nicolas/Dev/cadence-upstream-task-ics-feed`, partie de `upstream/main` (`eda9aa60`, v1.14.0).

## Résumé pour Nicolas

- **Ce que ça ajoute** : Profil → Agendas (et la fenêtre Agendas de la page Calendrier) gagne « Subscribe to your tasks ». Une adresse secrète `/api/feeds/tasks/tf_….ics` à coller dans Google Agenda, Apple Calendrier ou Outlook ; elle liste les tâches ouvertes avec échéance (de J-60 à J+400), dessinées comme sur le Calendrier. Seul un SHA-256 du jeton est stocké ; une nouvelle adresse coupe l'ancienne.
- **Fichiers** : module `backend/modules/task-feed/` (routes, service), migration `20261029100000-add-task-feed-token-to-users.js` (colonne `users.task_feed_token_hash` + index unique, helpers `safe*`), `backend/models/user.js`, `backend/app.js` (route publique avant `requireAuth`), `TaskFeedSection.tsx` + `taskFeedService.ts`, une ligne dans `CalendarFeedsManager.tsx`, `docs/20-daily-plan.md`, 26 locales (10 clés `profile.taskFeed.*`).
- **Taille** : 38 fichiers, +869 lignes, dont 312 de traductions ; hors locales 12 fichiers, +557 (dont 146 de tests).
- **Exclu** : tout le reste du fork (marque Cadence, Android, Google sync, habitudes, etc.). Repris de `5e620dd5` avec les noms de l'amont (`-//tududi//Task feed//EN`, calendrier « tududi »), statuts via `Task.STATUS`, bouton dans le style bleu de l'amont au lieu des jetons `bg-primary` du fork.
- **Risques** :
  - L'amont exige une discussion avant toute PR de fonctionnalité (`.github/CONTRIBUTING.md`) : ouvrir d'abord l'issue ci-dessous, puis remplacer `#<issue>` dans le corps.
  - L'adresse publique passe avant `requireSubscription` : sur une instance hébergée payante, le flux reste servi après la fin de l'abonnement. Signalé dans la PR.
  - Recoupe un peu CalDAV (déjà dans l'amont), mais CalDAV demande une connexion et des VTODO, que Google Agenda ne lit pas. Argument mis dans la PR.
  - Migration non rejouée sur PostgreSQL dans ce worktree (pas de Postgres local) ; même fichier que sur `main` du fork, déjà vérifié sur PG 16.
  - Les deux PR ajoutent une sous-section au même endroit de `docs/20-daily-plan.md` : la seconde fusionnée demandera un rebase trivial.

## Issue à ouvrir d'abord (Feature request)

Titre : `Subscribe to your tasks from another calendar app (.ics feed)`

> Tududi can show other calendars (iCal feeds) and sync tasks over CalDAV, but there is no way to see tududi tasks in Google Calendar: it only subscribes to an iCal URL and does not read VTODO.
>
> Proposal: a secret, read-only `.ics` address per user (Profile → Calendars) that lists their open tasks with a due date as events, drawn the same way as on the Calendar page. Only a hash of the token is stored; making a new address revokes the old one, and it can be turned off. I have this working and tested and can open a PR if it fits the project.

## Titre de la PR

`feat(calendar): subscribe to your tasks from another calendar app`

## Corps de la PR

<!-- pr-body:start -->
## Description

Adds a secret, read-only `.ics` address that lists a user's open tasks with a due date, so they can subscribe to their tasks from Google Calendar ("From URL"), Apple Calendar or Outlook.

CalDAV already lets clients sync tasks, but it needs a sign-in and serves VTODO, which Google Calendar does not read. A plain iCal URL works everywhere.

- Profile → Calendars (and the Calendars dialog on the Calendar page) gets a "Subscribe to your tasks" section: make an address, copy it, make a new one (the old one stops working) or turn it off.
- The address is shown once. Only a SHA-256 of the token is stored, in `users.task_feed_token_hash` (new migration, `safe*` helpers, unique index).
- The feed covers tasks due from 60 days ago to 400 days ahead, except done, archived and cancelled ones. A timed task runs from its start time (same day) to its due time, or from its due time for its estimate (one hour without one); a task without a time is an all-day event from its start day to its due day. Recurring tasks appear at their current due date only.

Endpoints:

| Method | Path | |
|---|---|---|
| GET/POST/DELETE | `/api/profile/task-feed` | status; POST returns `{ enabled: true, path }` once; DELETE turns it off |
| GET | `/api/feeds/tasks/:token.ics` | the feed, no sign-in; 404 for an unknown token |

## Type of Change

- [ ] Bug fix (fixes an issue)
- [x] New feature (adds functionality)
- [ ] Breaking change (breaks existing functionality)
- [ ] Documentation/Translation update

## Related Issues

Closes #<issue>

## Testing

**How did you test this?**

- `backend/tests/integration/task-feed.test.js`: off by default; open timed and all-day tasks are served with the right duration, done and undated ones are left out; a replaced or turned-off address returns 404; a made-up token returns 404.
- `frontend/components/__tests__/TaskFeedSection.test.tsx`: making an address shows it, turning it off hides it.
- `Calendar.feeds.test.tsx` and `tests/upgrade/schema-parity.test.js` still pass; `tsc --noEmit`, ESLint and Prettier are clean on the touched files.

- [ ] `npm run pre-push` passes

## Screenshots

<!-- Profile → Calendars, "Subscribe to your tasks" section, before and after making an address. -->

## Checklist

- [ ] This is not an AI slop crap, I know what I am doing
- [ ] Self-reviewed my own code, follows project style guidelines
- [x] Tests, docs, migrations, and translations updated (if applicable)

## Additional Notes

- The public route is registered with the other public routes, before `requireAuth`, so it is also outside `requireSubscription`: on a hosted instance a feed keeps working after the subscription ends. Happy to move it behind a subscription check if you prefer.
- Tokens are 24 random bytes (`tf_` prefix) and the route sits behind the existing `/api` rate limiter.
- Translations come from the same strings in all 26 locales; native speakers may want to polish them.
<!-- pr-body:end -->

## À faire avant l'envoi

1. Ouvrir l'issue ci-dessus sur `chrisvel/tududi` (ou en parler à chrisvel sur Discord), attendre son accord, mettre son numéro à la place de `#<issue>`.
2. Ajouter la capture d'écran (Profil → Agendas) et cocher les cases de la checklist qui te concernent. Rien n'a été essayé dans un navigateur ni avec un vrai abonnement Google Agenda depuis ce worktree : si tu le fais, ajouter la ligne « Subscribed to the feed from Google Calendar on a running instance. » dans Testing.
3. Case `npm run pre-push` : c'est `lint-staged`, qui ne voit rien une fois tout commité. `npm run lint` passe déjà dans le worktree (0 erreur, avertissements préexistants seulement) ; cocher la case si ça te suffit.

## Envoi (après accord)

```bash
cd /home/nicolas/Dev/cadence-upstream-task-ics-feed
git push origin upstream/task-ics-feed:feature/task-ics-feed
awk '/^<!-- pr-body:start -->$/{f=1;next}/^<!-- pr-body:end -->$/{f=0}f' \
  /home/nicolas/Dev/Cadence/docs/fork/upstream-prs/task-ics-feed.md > /tmp/task-ics-feed-body.md
gh pr create --repo chrisvel/tududi --base main \
  --head PreciselyWrong:feature/task-ics-feed \
  --title "feat(calendar): subscribe to your tasks from another calendar app" \
  --body-file /tmp/task-ics-feed-body.md
```
