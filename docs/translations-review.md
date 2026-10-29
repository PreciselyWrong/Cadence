# Translation review of the fork's new strings

This is an AI review, not a native-speaker one. It covers only the keys the fork added between `99ef695` and `00a878a` (focus stats, custom Eisenhower matrices, task feed, task pins, child tags, calendar options and arrange panel, summary page, project board). Native speakers should still check them.

## Across all languages

- "Start the tomato timer" was translated literally ("tomato", "tomate", "Tomate", "domates"...) in most files. It now names the Pomodoro timer, using the word each file already uses in its Pomodoro settings.
- `calendar.yearItems_one` and `calendar.multiDay_one` used the plural word. They now use the singular. The English `yearItems_one` was also changed to "item".
- Plural forms were added where the file already uses them: `_many` for es, fr, it, pt; `_few` for ro; `_few`/`_many` for pl, ru, sk, ua; `_two`/`_few` for sl; `_zero`/`_two`/`_few`/`_many` for ar.

## Per language

- **ar**: the `{{count}}` placeholder was missing in `lastDays_one`, so it was added back; full Arabic plural set for the three counted keys; Pomodoro wording.
- **bg**: a Latin "a" in "домата" was removed with the Pomodoro rewording; singular counts.
- **da**: "Mærke" changed to "Tag" to match the file; overdue changed to "Forsinkede" (the file's "Forsinket"); "Dagsorden" changed to "Agenda"; singular counts; Pomodoro.
- **de**: new strings moved from du to Sie (the file mostly uses Sie); "In N Tagen" changed to "Innerhalb von N Tagen"; download labels made into "Als .md herunterladen"; clearer board delete message; singular counts.
- **el**: Pomodoro wording; singular counts.
- **es**: "Etiqueta principal" changed to "Etiqueta padre"; "Prioridad (cualquiera de)" shortened to "(cualquiera)"; the literal "en su lugar" was removed; `_many`; singular counts.
- **fi**: "määräpäivä" changed to "eräpäivä" and "lohko" changed to "neljännes", matching the file and the drop messages; overdue changed to "Erääntyneet"; singular counts.
- **fr**: curly apostrophes changed to the file's straight `'`; priority Basse/Haute changed to Faible/Élevée to match the file; clearer `includeOpen` and `bestHour`; `_many`; singular counts.
- **id**: Pomodoro wording only.
- **it**: curly apostrophes changed to `'`; quotes changed to «»; overdue changed to "Scadute" (the file's "Scaduto"); "Tag padre"; better `bestHour`/`topTasks`; `_many`; singular counts.
- **jp**: Pomodoroタイマー; more natural `perDay`/`perHour`/`includeOpen`.
- **ko**: 포모도로 타이머; clearer per-day and per-hour labels.
- **nl**: overdue "Achterstallig" changed to "Te laat" to match the file; "Kleur op" changed to "Kleuren op"; better `bestHour`; singular counts.
- **no**: "Etikett/Etiketter" changed to "Tagg/Tagger" to match the new tag strings; overdue changed to "Forsinket"; singular counts.
- **pl**: overdue "Zaległe" changed to "Przeterminowane" (file term); better `bestHour`; `_few`/`_many`; correct "dzień"/"element" forms.
- **pt**: the file is Brazilian Portuguese, so the European forms (Eliminar, secção, guardar, num, vista, para aqui) were changed to Brazilian ones; "Etiqueta pai"; `_many`; singular counts.
- **ro**: `_few` added and `_other` changed to "de zile" / "de elemente" (the file's pattern); better `bestHour`.
- **ru**: abbreviations "дн."/"элем." replaced with full `_one`/`_few`/`_many`/`_other` forms; "Повестка" changed to "Расписание"; Pomodoro.
- **sk**: board changed to "Tabuľa" (file term); `_few`/`_many`; singular counts; Pomodoro.
- **sl**: "opravilo" changed to "naloga" in all new strings (the file uses "naloga" about 4 times as often); overdue changed to "Zapadle"; "Dnevni red" changed to "Razpored"; `_two`/`_few`; singular counts.
- **sv**: overdue "Försenade" changed to "Förfallna" (the file's "Förfallen"); Pomodoro.
- **tr**: curly apostrophe changed to `'`; the new sentences moved to the file's formal -in/-iniz register; Pomodoro.
- **ua**: curly apostrophe changed to `'`; "Ейзенгавер" changed to "Айзенхауер" to match the file; full plural forms; "Порядок денний" changed to "Розклад"; Pomodoro.
- **vi**: Pomodoro; the literal "thay vào đó" was removed.
- **zh**: `perHour` changed to "各时段分钟数".

## Left as is (uncertain)

- de: the file mixes du and Sie (about 65 du and 166 Sie strings before the fork). The new strings follow the majority.
- el: "Πίνακας" is now used for both the matrix and the project board.
- ko: the file uses "연체" for overdue, but the new strings use "기한 지남". The new term was kept because it reads better.
- jp: the file uses both マトリクス and マトリックス, so this was not changed.
- sl: the file mixes ti and vi. The new strings were left as written.
