# PR amont : vues Agenda et Année du calendrier

Brouillon, rien n'est envoyé. Branche locale `upstream/calendar-views` (commit `dca0f3f6`), worktree `/home/nicolas/Dev/cadence-upstream-calendar-views`, partie de `upstream/main` (`eda9aa60`, v1.14.0).

## Résumé pour Nicolas

- **Ce que ça ajoute** : deux vues de plus dans le sélecteur de `/calendar` (Mois, Semaine, Jour, **Agenda**, **Année**).
  - Agenda : le mois en liste, un titre par jour qui a des tâches ou des événements, la journée entière d'abord puis par heure, ouvert sur aujourd'hui ; les flèches changent de mois.
  - Année : douze mini-mois, chaque jour teinté selon son nombre de tâches (4 niveaux), le nombre en infobulle ; un clic ouvre le jour en vue Jour ; les flèches changent d'année.
- **Fichiers** : `frontend/components/Calendar/CalendarAgendaView.tsx`, `CalendarYearView.tsx` (nouveaux), `frontend/components/Calendar.tsx` (+31/-7, laissé dans le style non Prettier de l'amont pour garder un diff lisible), test `Calendar.agendaYear.test.tsx`, `docs/20-daily-plan.md`, 26 locales (`calendar.agenda`, `calendar.year`, `calendar.agendaEmpty`, `calendar.yearItems_*` avec les pluriels de chaque langue).
- **Taille** : 31 fichiers, +743/-7, dont 149 de traductions ; hors locales 5 fichiers, +594/-7 (dont 228 de tests).
- **Exclu** (dépend de fonctions propres au fork, à proposer plus tard si l'amont accroche) : vue N jours et options de vue (`ui_settings.calendar`, `ViewOptions.tsx`), numéros de semaine, mini-calendrier, impression, panneau « Arrange tasks », durée réelle des tâches, occurrences récurrentes, jours fériés, habitudes, Google. Repris de `cd357ba6`, `7b08ab77`, `d820689b`, adaptés au `CalendarEvent` de l'amont (pas de champ `allDay` : un événement de minuit à minuit est « journée entière »), premier jour de semaine lu comme dans les autres vues de l'amont, jetons `bg-primary` du fork remplacés par du bleu.
- **Risques** :
  - L'amont exige une discussion avant toute PR de fonctionnalité : ouvrir d'abord l'issue ci-dessous, puis remplacer `#<issue>`.
  - La vue Année ne compte que les tâches (dates d'échéance et de report) : l'API des flux s'arrête à 62 jours. Dit dans la PR et la doc.
  - Non vérifié dans un navigateur (tests Jest + typecheck seulement) : faire les captures avant l'envoi.
  - Même sous-section de `docs/20-daily-plan.md` que la PR du flux .ics : rebase trivial pour la seconde fusionnée.

## Issue à ouvrir d'abord (Feature request)

Titre : `Calendar: agenda (list) and year views`

> The Calendar page has month, week and day views. Two more would help with planning:
>
> - **Agenda**: the month as a chronological list, one heading per day that has tasks or calendar events, opened at today. Easier to scan than the month grid, especially on a phone.
> - **Year**: twelve small month grids, each day shaded by how many tasks it has; clicking a day opens it in the day view.
>
> Both are front-end only and reuse the data the page already loads. I have them working and tested and can open a PR if they fit the project.

## Titre de la PR

`feat(calendar): add agenda and year views`

## Corps de la PR

<!-- pr-body:start -->
## Description

Adds two views to the Calendar page switcher, next to Month, Week and Day:

- **Agenda**: the month as a list, one heading per day that has tasks or calendar events. All-day events come first, then items by start time; an event spanning several days is listed on each of them. It opens scrolled to today (or the next day with items), and the arrows move by month, so it uses the same feed window as the month view.
- **Year**: twelve small month grids. Each day is shaded in four steps by how many tasks it has (1, 2, 3, 4 or more), with the count in its tooltip. Clicking a day opens it in the Day view; the arrows move by year. It counts tasks only, since `/api/calendar-feeds/events` serves at most 62 days.

Front-end only: no new endpoint, setting or migration. Both views respect the first day of the week like the existing ones.

## Type of Change

- [ ] Bug fix (fixes an issue)
- [x] New feature (adds functionality)
- [ ] Breaking change (breaks existing functionality)
- [ ] Documentation/Translation update

## Related Issues

Closes #<issue>

## Testing

**How did you test this?**

- New `frontend/components/__tests__/Calendar.agendaYear.test.tsx`: the agenda lists only days of the month with items, in time order with all-day first, a multi-day event on each day, and an empty state; the year view renders twelve months, shades a day with its count and reports the clicked day; on the page, all five views are offered and a day picked in the year opens in the day view.
- `Calendar.feeds.test.tsx` and `Calendar.views.test.tsx` still pass; `tsc --noEmit` and ESLint are clean, Prettier is clean on the new files.

- [ ] `npm run pre-push` passes

## Screenshots

<!-- Agenda and Year views, light and dark. -->

## Checklist

- [ ] This is not an AI slop crap, I know what I am doing
- [ ] Self-reviewed my own code, follows project style guidelines
- [x] Tests, docs, migrations, and translations updated (if applicable)

## Additional Notes

- `Calendar.tsx` is not Prettier-formatted on `main`; I left its existing lines as they are so the diff only shows the change. Running `lint-staged` on it would reformat the whole file.
- Translations come from the same strings in all 26 locales, with each language's plural forms for the year tooltip.
<!-- pr-body:end -->

## À faire avant l'envoi

1. Ouvrir l'issue ci-dessus sur `chrisvel/tududi` (ou en parler à chrisvel), attendre son accord, mettre son numéro à la place de `#<issue>`.
2. Lancer le worktree (`npm run db:init` puis `npm start`, sur d'autres ports que ton serveur de dev), vérifier les deux vues en clair et en sombre, ajouter les captures, cocher les cases qui te concernent.
3. Case `npm run pre-push` : c'est `lint-staged`, qui ne voit rien une fois tout commité. `npm run lint` passe déjà dans le worktree (0 erreur, avertissements préexistants seulement) ; cocher la case si ça te suffit. Si tu relances lint-staged avec `Calendar.tsx` indexé, Prettier reformate tout le fichier.

## Envoi (après accord)

```bash
cd /home/nicolas/Dev/cadence-upstream-calendar-views
git push origin upstream/calendar-views:feature/calendar-agenda-year-views
awk '/^<!-- pr-body:start -->$/{f=1;next}/^<!-- pr-body:end -->$/{f=0}f' \
  /home/nicolas/Dev/Cadence/docs/fork/upstream-prs/calendar-views.md > /tmp/calendar-views-body.md
gh pr create --repo chrisvel/tududi --base main \
  --head PreciselyWrong:feature/calendar-agenda-year-views \
  --title "feat(calendar): add agenda and year views" \
  --body-file /tmp/calendar-views-body.md
```
