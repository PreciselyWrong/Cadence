# Fixtures dorées des habitudes

Cas JSON rejoués par deux moteurs qui doivent donner les mêmes résultats :

- Kotlin : `android/domain/src/test/kotlin/ch/nicolab/cadence/domain/GoldenFixturesTest.kt` (règles de référence, `android/domain`) ;
- JavaScript : `backend/tests/unit/habits/goldenFixtures.test.js` (moteur `backend/modules/habits/cadence/`).

Une règle modifiée d'un seul côté fait échouer l'un des deux tests. Les attendus viennent des tests Kotlin du domaine (champ `source`). Une règle nouvelle ajoute d'abord un cas ici, rouge des deux côtés.

## Fichier

```json
{ "suite": "evaluate", "cases": [ { "kind": "evaluate", "name": "…", "source": "HabitEvaluatorTest.kt: nom du test", … } ] }
```

Un fichier = un `suite` ; chaque cas a `kind`, `name` (unique dans le fichier) et `source`. Seuls les champs listés dans `expect` sont comparés.

## Types communs

- Date : `"YYYY-MM-DD"`. Instant : ISO 8601 UTC. Jour de semaine : `"MONDAY"` … `"SUNDAY"`.
- `goal` : `{ targetMinor, period: "DAY"|"WEEK"|"MONTH", goalType?: "BINARY"|"COUNT"|"QUANTITY"|"DURATION" (défaut QUANTITY), unit?: {id, dimension, nameFr, symbol, scaleToCanonical}|null, frequencyTarget?: int|null, minimumMinor?: int|null, direction?: "AT_LEAST"|"AT_MOST"|"TRACK_ONLY" (défaut AT_LEAST), progression?: {step, cadence: "WEEKLY"|"MONTHLY", capMinor: int|null, startsOn} | null }`
- `schedule` : `{ mode?: "EVERY_DAY"|"SELECTED_DAYS"|"FLEXIBLE_PERIOD"|"INTERVAL_DAYS" (défaut SELECTED_DAYS), activeDays?: [jours] (défaut les 7), firstDayOfWeek?: jour (défaut MONDAY), intervalDays?: int (défaut 2) }`
- `habit` : `{ id?: "h" , startsOn?: date (défaut 1970-01-01), active?: true, archived?: false, goal, schedule? }`
- `versions` : `[ { effectiveFrom: date, habit } ]`. L'habitude d'une date est la version dont `effectiveFrom` est la plus récente et ≤ date ; avant la première version, il n'y en a pas. Abréviation : `habit` seul = une version valable de tout temps.
- `entries` : `[ { localDate, valueMinor, habitId?: (défaut l'id de l'habitude), sessionId?: string|null } ]`
- `pauses` : `[ { start, endExclusive: date|null } ]`

## Genres de cas

| `kind` | Entrées | `expect` |
|---|---|---|
| `evaluate` | `habit`, `date`, `entries?`, `pauses?` | sous-ensemble de : `period: {start, endExclusive}`, `progressMinor`, `completedQuantity`, `reachedMinimum`, `validatesPeriod`, `attainment`, `targetMinor`, `limitStatus`, `sessionCount`, `completedFrequency`, `isCompleted`, `isPaused`, `isPlannedForDate`, `needsAttentionNow`, `requiresAction`, `countsAsFailure` |
| `streak` | `versions`/`habit`, `today`, `entries?`, `pauses?`, `maxPeriods?` | `current`, `best` |
| `statistics` | `versions`/`habit`, `today`, `entries?`, `pauses?` | sous-ensemble de : `evaluatedPeriods`, `validatedPeriods`, `idealPeriods`, `previousEvaluatedPeriods`, `previousValidatedPeriods`, `previousIdealPeriods`, `observablePeriods`, `previousObservablePeriods`, `periodType`, `isHomogeneous`, `successRatePercent`, `trendPercentagePoints`, `confidence`, `from`, `untilExclusive`, `previousFrom`, `comparison` (objet `{currentRatePercent, previousRatePercent, deltaPercentagePoints, trend}` ou `null`), `dayStatuses` (`{date: statut}` sous-ensemble de `days`), `calendarDayStatuses` (idem pour `calendarDays`), `calendarDaysCount`, `periods` (liste complète de `{start, endExclusive, periodType, status}`) |
| `activity` | `habitId`, `startsOn`, `today`, `entries?` | champs de `HabitActivityStats` (`entries30`, `activeDays30`, `totalMinor30`, `peakDayMinor30`, `averagePerActiveDayMinor30`, `calendarDays30`, `entries90`, … `calendarDaysAllTime`) |
| `target_at` | `goal`, `date` | `targetMinor` |
| `goal_invalid` | `goal` | `error: true` : la construction du `goal` est refusée |
| `window` | `date`, `period`, `firstDayOfWeek?` | `start`, `endExclusive` |
| `is_planned` | `habit`, `date` | `planned` |
| `pause` | `pause: {start, endExclusive, reason?, reasonLabel?}`, `date` | `includes`, `isSingleDay`, `isCancellableOn`, `resumedOn` (`null` ou `{start, endExclusive}`) |
| `group_active` | `group: {startMinute, endMinute}`, `time: "HH:mm"` | `active` |
| `timer` | `timer: {accumulatedSeconds, runningSince: instant|null}`, `now` | `elapsedSeconds`, `isRunning` |
| `timer_attainment` | `goal`, `progressMinor`, `elapsedSeconds` | `attainment` |
