# Markdown, liens et rétroliens (notes et descriptions)

Le contenu d'une note et la description d'une tâche sont du Markdown complet, rendu par un seul composant web (`frontend/components/Shared/MarkdownRenderer.tsx`, react-markdown + remark-gfm) : titres, gras, italique, barré, listes, cases à cocher (cliquables), tableaux, code (coloré), citations et encadrés `> [!NOTE]`, images et vidéos, liens et adresses nues (autoliens GFM), numéros de téléphone et e-mails.

**Liens :** [Notes](05-notes-system.md), [Liens](37-links.md), [Personnes](19-people-and-roles.md)

## Sécurité

- Le HTML brut n'est jamais interprété (pas de `rehype-raw`) : il s'affiche comme du texte.
- Seuls `http`, `https`, `mailto`, `tel`, `xmpp`, `irc(s)` et les chemins relatifs passent (`contactUrlTransform`) ; `javascript:`, `data:` et les autres schémas sont vidés.
- Un lien web externe s'ouvre dans un nouvel onglet avec `rel="noopener noreferrer"` (dans le client Linux, dans le navigateur par défaut). Un lien vers une page de l'app (`/note/…`, `/notes/…`, `/task/…`, `/person/…`, relatif ou en adresse complète du même site) reste dans l'app.

## Syntaxe des liens internes

| Écrit | Pointe vers | Rendu |
|---|---|---|
| `[[Titre]]` | la note de ce titre (casse ignorée) | puce « NOTE: Titre » |
| `[[task:Nom]]` | la tâche de ce nom (ouverte d'abord, puis la plus récente) | puce « TASK: Nom » |
| `@[Nom](person:<uid>)` | la personne de cet uid | puce `@Nom` vers sa fiche |
| `[texte](/note/<uid>)`, `/task/<uid>`, `/person/<uid>` | l'élément de cet uid | lien dans l'app |

- Une cible inconnue s'affiche en puce estompée « + » : un clic crée la note (et l'ouvre) ou la tâche (et ouvre son panneau) avec ce titre.
- Les noms des `[[task:…]]` sont résolus par `POST /api/content-links/resolve` `{ tasks: [noms] }` → `{ tasks: { "<nom en minuscules>": uid } }`, parmi les tâches que le lecteur peut ouvrir (100 noms au plus).
- Dans le code (`inline` ou bloc ``` ```), rien n'est un lien.
- Une page publique ne montre que les notes publiques liées ; une tâche ou une mention y reste une puce sans lien.

## Rétroliens

`GET /api/note/:uid/backlinks`, `GET /api/task/:uid/backlinks`, `GET /api/people/:uid/backlinks` renvoient les notes et tâches qui pointent vers l'élément, de la plus récemment modifiée à la plus ancienne (100 au plus) :

```json
[{ "type": "note", "uid": "…", "title": "Voyage", "snippet": "… vérifier Liste de bagages deux fois.", "updated_at": "…" }]
```

- Droits : la cible doit être lisible (`hasAccess('ro')` pour une note ou une tâche, la fiche d'une personne pour une personne, sinon 403 ou 404) ; seules les sources que le lecteur peut ouvrir sont listées (`ownershipOrPermissionWhere`, partages directs, de groupe et de projet compris).
- Calcul à la lecture, sans table : une recherche `LIKE` sur l'uid et le `[[titre]]` de la cible (index de candidats, 300 au plus par type), puis le parseur `backend/modules/content-links/core/parse.js` garde les vrais liens (hors code) et fait l'extrait. Un renommage, une modification ou une suppression se reflète donc tout de suite, quel que soit le chemin d'écriture (web, MCP, synchro, TODO.md). Une note qui se cite elle-même n'est pas listée ; les tâches-habitudes sont exclues.
- Web : section « Rétroliens » en bas de la note, du panneau de tâche et de la fiche d'une personne, seulement s'il y en a ; un clic ouvre la note ou le panneau de la tâche.

## Édition : barre de mise en forme et mentions

Notes et descriptions de tâches s'éditent dans le même éditeur (`frontend/components/Note/MarkdownEditor.tsx`, CodeMirror avec aperçu en direct) : la description d'une tâche s'y ouvre au clic et s'enregistre quand le focus quitte l'éditeur, sa barre et ses menus.

- **Barre en bas de l'éditeur** (collée en bas pendant le défilement) : gras (Ctrl/⌘+B), italique (Ctrl/⌘+I), barré (Ctrl/⌘+Maj+X), titre (cycle H1 → H2 → H3 → texte ; Ctrl/⌘+1/2/3), liste à puces, numérotée, à cases, citation, code (Ctrl/⌘+E : en ligne sur une ligne, bloc ``` ``` sur plusieurs lignes), lien (Ctrl/⌘+K), `[[ ]]` (ouvre le choix de note), `@` (ouvre le choix de personne), tableau (grille lignes × colonnes, flèches et Entrée au clavier). Le curseur dans un tableau ajoute « ajouter / supprimer une ligne, une colonne ». Chaque bouton a son `aria-label` et son raccourci dans l'infobulle ; un clic garde la sélection.
- Les commandes sont des fonctions pures sur le texte Markdown (`frontend/components/Note/editor/markdownFormat.ts` : texte + sélection → un remplacement + nouvelle sélection) ; elles marchent dans un élément de liste (retrait et puce gardés, tableau et code retirés sous la puce). `textCommands.runEdit` les applique à CodeMirror ; une autre surface (par exemple un éditeur en plan) peut les appliquer avec `applyEdit`.
- **Mentions** : taper `@` en début de mot ouvre la liste des personnes (`GET /api/people`, lue à la première ouverture ; flèches, Entrée ou Tab, Échap) ; le choix s'enregistre `@[Nom](person:<uid>)`. Un `@` au milieu d'un mot (adresse e-mail) n'ouvre rien. Règles pures : `mentionTrigger`, `mentionToken` dans `frontend/utils/markdownLinks.ts`.
- `[[task:…]]` n'ouvre pas le choix de note ni la proposition de créer une note ; un Ctrl/⌘-clic sur sa puce dans l'éditeur ouvre la tâche.

## Android

Rien à synchroniser : les rétroliens sont calculés par le serveur depuis le texte déjà synchronisé.

- Rendu (`notes/Markdown.kt`, pur et testé, `ui/MarkdownView.kt`) : titres, listes et cases (cocher réécrit le texte), citations, code (rien n'y est un lien), filets, tableaux GFM, gras, italique, barré, liens et adresses nues ; la description d'une tâche se lit rendue dans sa fiche, le crayon l'édite (texte brut).
- Puces : `[[Titre]]` ouvre la note (sinon un message), `[[task:Nom]]` la tâche de ce nom sur l'appareil (une ouverte d'abord, `WikiLinks.findTask`), `[texte](/note|task/<uid>)` l'élément ; `@[Nom](person:uid)` et `/person/<uid>` se lisent en puce sans s'ouvrir (pas de personnes sur Android).
- Rétroliens : section « Rétroliens » en bas d'une note et d'une fiche de tâche, lue en ligne à l'ouverture (`contentlinks/BacklinksClient`), absente hors ligne ou sans lien ; toucher ouvre la note ou la tâche.
- Pas encore : création d'une cible inconnue, choix `@`, barre complète, rétroliens d'une personne (`TODO.md`).
