# Plan (outliner) des notes et descriptions

Les notes et les descriptions de tâches s'éditent comme un plan, façon Workflowy ou Logseq, au clavier d'abord. Rien ne change dans le stockage : le texte reste du Markdown ordinaire (listes à puces `- `, retrait de 2 espaces), lu tel quel par Android, les liens `[[…]]` et les rétroliens (`docs/44-notes-links.md`). Aucune migration : une note en prose s'affiche comme avant et n'est pas réécrite à l'ouverture.

**Liens :** [Markdown, liens et rétroliens](44-notes-links.md), [Notes](05-notes-system.md)

## Édition (web)

Une seule surface : l'éditeur CodeMirror des notes (`frontend/components/Note/MarkdownEditor.tsx`). Les touches du plan passent avant celles du Markdown et ne font rien hors d'une liste (sauf Entrée sur une ligne de prose, voir plus bas).

| Touche | Effet |
|---|---|
| Entrée | Coupe la puce au curseur : le texte après le curseur devient la puce suivante et garde les enfants. En fin de puce : nouvelle sœur, ou premier enfant si la puce a des enfants dépliés. En début de puce : puce vide au-dessus. Une puce vide en retrait remonte d'un niveau ; au premier niveau, elle quitte la liste (ligne vide). Une numérotation continue (`2.`), une case ajoute une case vide. |
| Maj+Entrée | Retour à la ligne dans la même puce (ligne de suite alignée sur son texte). |
| Tab / Maj+Tab | Retrait / sortie de la puce **avec ses enfants**. Tab rattache à la puce sœur du dessus (aligné sur son texte, donc 3 espaces sous `1.`). Maj+Tab place la puce juste après son parent ; les sœurs qui la suivaient restent sous le parent (comme Workflowy). Hors liste, Tab laisse le focus partir. |
| Retour arrière en début de texte | Retire d'abord la case ; supprime une puce vide ; fusionne une puce sans enfants avec la ligne du dessus ; la première puce devient une ligne simple. Sans effet sur une puce qui a des enfants. |
| Alt+↑ / Alt+↓ | Échange la puce et ses enfants avec la sœur du dessus / du dessous (sans sortir du parent). |
| Ctrl/⌘+↑ / Ctrl/⌘+↓ | Replie / déplie la puce. |
| Ctrl/⌘+. / Ctrl/⌘+, | Zoom sur la puce / remonte d'un niveau. |
| Ctrl/⌘+Entrée | Case : aucune → `[ ]` → `[x]` → `[ ]` ; une ligne simple devient `- [ ]`. |
| Ctrl/⌘+Maj+T (ou Alt+Maj+T) | Fait de la puce une tâche liée (voir plus bas). Les navigateurs gardent souvent Ctrl+Maj+T pour rouvrir un onglet : Alt+Maj+T et le menu de la puce marchent partout. |

- **Saisie** : taper sur une ligne vide hors liste commence une puce (`- ` ajouté). Les débuts de blocs Markdown (`#`, `>`, `|`, `` ` ``, `-`, `*`, `+`, espace) ne sont pas touchés : titres, citations, tableaux et code s'écrivent comme avant. Entrée sur une ligne de prose la transforme en puce et ouvre la suivante : c'est le seul moment où une prose existante devient une puce.
- **Puces** : toujours un point, même sous le curseur. Un clic sur le point zoome. Un clic droit sur le point ou la case ouvre le menu : Zoomer, Replier / Déplier, Créer une tâche.
- **Repli** : un chevron à gauche (visible au survol, toujours pour une puce repliée) replie la puce ; « … » la déplie. Une puce repliée le reste quand on la déplace.
- **Zoom** : seule la puce et ses enfants restent visibles, la puce sert de titre ; un fil d'Ariane « Tout › parents » au-dessus ramène plus haut. Rien hors de la puce ne peut changer (Ctrl/⌘+A sélectionne la puce zoomée). Entrée sur le titre ajoute un premier enfant. Le zoom ne dure que la visite.
- Les commandes de la barre de mise en forme, le choix `@` et la complétion `[[` marchent dans les puces. Contenu de bloc (tableau, code) : retrait sous la puce, comme avant.

Règles pures : `frontend/components/Note/editor/outline.ts` (texte → arbre, chaque édition rend un remplacement et la sélection) ; liaison CodeMirror : `editor/outlineEditor.ts`.

## Repli mémorisé

Par lecteur et par navigateur, dans `localStorage` (`cadence.outlineFolds.note:<uid>` ou `task:<uid>`), partagé par l'éditeur et la lecture. Une puce y est reconnue par son texte et son rang parmi les puces de même texte : renommer une puce repliée la déplie à la visite suivante. Stockage refusé (navigation privée) : le repli dure la visite. Rien n'est synchronisé.

## Lecture

Le rendu (`frontend/components/Shared/MarkdownRenderer.tsx`, propriété `outlineKey`) montre le même plan là où l'on lit une note ou une description (panneau de tâche, mode focus, fenêtre de note) : chevrons de repli, point qui zoome (fil d'Ariane, rendu du seul sous-arbre), cases cochables qui écrivent au bon endroit même zoomé. Sans `outlineKey` (cartes, page publique, blog), les listes restent des listes simples.

## Puce → tâche liée

Ctrl/⌘+Maj+T ou « Créer une tâche » du menu de la puce :

- crée une tâche nommée d'après le texte de la puce sans Markdown (gras, liens, `[[…]]`, mentions réduits à leur texte ; 255 caractères au plus) ;
- dans le projet de la note (ou de la tâche dont c'est la description), sinon sans projet ;
- **remplace** le texte de la puce par `[[task:Nom]]` (la puce se lit alors en puce « TASK » ; la case est gardée) : le nom n'apparaît qu'une fois et la tâche liste la note dans ses rétroliens. Le texte est remplacé tout de suite ; si la création échoue, un message le dit et la puce reste un lien vers une tâche à créer (« + »).
- Une case `- [ ] …` se convertit de la même façon : `- [ ] [[task:Nom]]`.

**Case liée à une tâche** : en lecture, la case d'une puce qui commence par `[[task:Nom]]` suit l'état de la tâche (cochée si elle est terminée ou archivée) ; un clic termine ou rouvre la tâche. Le texte de la note n'est jamais réécrit (le `[ ]`/`[x]` écrit peut différer de ce qu'on voit). `POST /api/content-links/resolve` renvoie pour cela `done` : les noms (en minuscules) dont la tâche est terminée. Dans l'éditeur, la case reste celle du texte.

## Android

À reprendre (`TODO.md`) : même édition en plan sur les notes et descriptions (mêmes règles de texte, même stockage), repli et zoom, puce → tâche liée, case liée à l'état de la tâche.
