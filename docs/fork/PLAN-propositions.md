# Plan : propositions d'agent natives dans Cadence

Décision du 2026-11-13. Le bouton « Planifier ma semaine » ouvrait un chat avec Herald (Opus, outils, plus d'une minute) : pas ce que Nicolas veut. Il veut un bouton qui lance une demande en fond, une notification quand c'est prêt (web et Android), et une fenêtre native de Cadence où rien ne trahit Hermes. Le chat reste accessible depuis la fenêtre, jamais imposé.

## Principe

Comme les cartes Mail (`docs/43-mail-triage.md`) : l'agent propose, Cadence affiche et applique.

- **Cadence possède la proposition** : stockage, faits, rendu, application. Une proposition est un objet typé (`kind` : `week`, `review`), pas des blocs libres.
- **Déterministe = code.** Cadence calcule les faits (tâches ouvertes, retards, plan des jours, charge, agenda connu de Cadence, file de la revue rapide) et applique les changements par ses propres écritures. L'agent ne fait que juger et rédiger.
- **L'agent** : un profil Hermes dédié (`planificateur`), Sonnet, sans outils ni chat, une seule réponse JSON validée par Cadence. Faits compacts dans la demande : pas de lecture par outils, donc rapide et peu de tokens.
- **Rien ne change avant « Appliquer ».** Chaque changement est coché par défaut ; on décoche ce qu'on refuse.

## Parcours

1. Bouton natif « Planifier ma semaine » (Plan, Aujourd'hui) ou « Préparer ma revue » (Revue rapide). `POST /api/proposals { kind, start?, end? }` crée la proposition `pending` avec ses faits et répond tout de suite ; le bouton devient « En préparation… ».
2. Cadence émet `proposal.requested` (faits inclus) ; le plugin Hermes lance un run sur le profil réglé (`proposalAgent`), attend la réponse en fond et la renvoie (`POST /api/proposals/:id/answer`).
3. Cadence valide le JSON (uid connus des faits, dates dans la période, opérations de la liste blanche ; le reste est retiré), passe la proposition `ready` et notifie : « Ta semaine est prête » (web et Android). Échec ou délai : notification d'erreur courte, bouton « Réessayer ».
4. Le toucher ouvre la fenêtre native : une phrase de synthèse, les questions de l'agent en puces, les changements groupés par jour avec leur raison d'une ligne, puis « Appliquer (N) », « Répondre » (texte libre : nouvelle version de la proposition, mêmes faits) et « Continuer dans le chat » (lien discret vers la page Agents).

## Contrat de réponse (`week`)

```json
{
  "summary": "Semaine chargée mercredi ; deux retards replacés.",
  "questions": [{ "id": "q1", "text": "Tu travailles mardi ?", "choices": ["Oui", "Non"] }],
  "changes": [
    { "task_uid": "abc", "op": "plan_day", "date": "2026-11-17", "reason": "Mardi est libre" },
    { "task_uid": "def", "op": "later", "reason": "Pas cette semaine" }
  ]
}
```

Opérations : `plan_day` (plan du jour, échéance inchangée), `this_week`, `later`, `due` (nouvelle échéance), `drop`. Les écritures réutilisent celles qui existent (`daily-plan/ops.js`, `PATCH /task`, `#someday`).

`review` : `{ "summary", "items": [{ "task_uid", "choice", "reason" }] }`, `choice` pris parmi les choix de sa liste dans la revue rapide. La revue rapide s'ouvre avec ce choix présélectionné et la raison sous l'élément ; un tap valide, les autres choix restent.

## Ce qui change ailleurs

- Plugin Hermes : retirer les actions `plan-week` et `plan-overdue` (chat) ; ajouter le transport `proposal.requested` → run → `answer`, et le réglage `proposalAgent`.
- Hermes : profil `planificateur` (Sonnet, aucun outil, skill du contrat ci-dessus) ; le job « Planning de la semaine » de Herald (vendredi 8 h, Opus, Kyllene) est remplacé par un cron qui fait `POST /api/proposals { kind: "week" }` par capgw, puis mis en pause.
- Pas de plan du jour automatique (choix de Nicolas) : seulement au clic.
- Revue rapide web : déjà à `/review`, ouverte depuis « Plus » ; l'ajouter à la barre latérale par défaut.
- Android : même bouton, même notification, même feuille ; propositions lues en ligne (pas de Room), comme les cartes Mail.

## Étapes (un commit vérifié chacune)

1. Serveur : table `proposals`, faits `week` et `review` (code pur testé), validation de la réponse, application, notification, routes et MCP → vérif : tests unitaires et d'intégration, SQLite et Postgres.
2. Plugin Hermes 3.0.0 : transport et réglage, actions de chat retirées → vérif : `npm test`, une vraie proposition de bout en bout.
3. Hermes : profil `planificateur`, cron du vendredi, ancien job en pause → vérif : run réel, durée et tokens relevés.
4. Web : bouton, fenêtre, revue présélectionnée, Revue dans la barre → vérif : navigateur, 26 traductions.
5. Android : bouton, notification, feuille, revue présélectionnée → vérif : tests du domaine, installation sur le téléphone.

## Questions ouvertes

- Agenda : les faits ne contiennent que l'agenda que Cadence connaît déjà (agendas synchronisés). Si un agenda Google manque à Cadence, l'agent ne le voit pas.
- Revue : demande au clic (« Préparer ma revue », environ 20 s) ou préparée chaque nuit pour être prête à l'ouverture.
