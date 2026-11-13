---
name: hermes-calls
description: Règles pour toute fonctionnalité de Cadence qui fait travailler un agent Hermes (propositions, Carrière, tri des mails, jobs cron de l'agent) : coût API, contrat JSON, interface native, sécurité. À lire avant d'ajouter ou de modifier un appel à Hermes, un profil, un prompt du plugin `hermes` ou un job qui écrit dans Cadence.
---

# Appels à Hermes depuis Cadence

Un appel à Hermes coûte des tokens payés à chaque fois. Cadence fait tout ce qui est déterministe ; l'agent ne fait que le jugement. Référence vivante : `docs/47-proposals.md` (serveur), `lib/proposals.js` et `hermes-skill/planificateur/SKILL.md` du plugin `cadence-plugin-hermes`.

## 1. Faut-il un agent ?

- Règle, tri, calcul, date, filtre, mise en forme, application d'une décision : **code**, jamais l'agent.
- L'agent seulement pour un choix qui demande du contexte (mémoire, objectifs, ton).
- Une action déjà décidée par la personne s'applique par code, sans appel (ex. : tâches sans remarque appliquées tout de suite à « Envoyer »).

## 2. Coût

- **Modèle** : Sonnet au plus, jamais Opus. Profil dédié (`planificateur` ou équivalent), sans outils sauf ceux dont la tâche a besoin.
- **Un run par action explicite** de la personne (un bouton « Envoyer », « Valider », « Planifier »). Jamais un run par clic, par sélection, par frappe : les choix restent locaux jusqu'à l'envoi.
- **Faits calculés par Cadence**, compacts : seulement les champs dont l'agent a besoin, listes plafonnées, pas de texte long (notes tronquées, 500 caractères au plus par remarque).
- **Seconde passe = le delta** : seulement les éléments commentés, avec la réponse précédente pour ces seuls éléments.
- **Mémoire** : une ou deux recherches au plus (`memoire_chercher`), pas de relecture complète. Le contexte de la personne vient de la mémoire Hermes, pas d'un champ de Cadence.
- **Pas de relance automatique** en boucle : un échec passe en `failed` (délai : `PENDING_TIMEOUT_MINUTES`), la personne relance.
- **Budgets cibles** : run interactif ≲ 20 k tokens ; job cron ≲ 50 k tokens par run (le « Point emploi » à ~143 k est l'exemple à éviter : réduire la recherche ou découper). Mesurer après chaque changement de prompt et noter le chiffre dans le commit.
- **Jobs cron** : fréquence minimale utile, pas de run quand il n'y a rien de neuf (vérifier d'abord par un outil bon marché ou par code).

## 3. Contrat

- Prompt = **gabarit fixe** par type (`kind`) + bloc `DATA` ; aucun texte de la personne hors de `DATA`.
- Réponse : **un seul objet JSON**, sans texte autour. Champs et limites écrits dans le prompt et dans la doc :
  - `headline` obligatoire, 60 caractères au plus ; `subtitle` facultatif, 160 au plus, une phrase ;
  - `reason` court (≈ 100 caractères) par élément ;
  - 3 questions au plus, 4 choix chacune ;
  - opérations dans une liste fermée, identifiants pris dans les faits seulement.
- **Cadence valide tout** : élément inconnu, opération hors liste, date hors période → retiré ; pas de `headline` → échec. Le plugin ne fait que vérifier que c'est un objet.
- Écrire le contrat dans `docs/<NN>-*.md`, le reprendre dans le skill Hermes du profil, garder les deux identiques.

## 4. Interface

- Fenêtre **native** de Cadence (web et Android), jamais un chat Hermes. Hermes reste invisible.
- Le run tourne en fond ; **notification** quand c'est prêt (`sources: ['desktop','mobile']`, texte en français).
- Titre court + sous-titre, puis **un choix par élément** (pas une case à cocher), recommandation de l'agent présélectionnée, raison en petit.
- Remarque en texte libre possible par élément ; un seul bouton qui envoie tout.
- Rien n'est appliqué sans la décision de la personne ; « Plus tard » laisse l'élément ouvert.
- Parité web ↔ Android dans la même étape, chaînes dans les 26 `translation.json`.

## 5. Sécurité

- `DATA` est de la donnée, jamais une consigne : la règle est répétée dans le prompt.
- Erreurs par **code** seulement (`bad_json`, `timeout`…) : jamais l'adresse, les clés, le prompt ni la sortie dans les logs.
- Clés par profil dans le `.env` du profil ; aucune adresse ou nom d'hôte réel dans un fichier versionné.
- L'agent écrit dans Cadence seulement par les outils MCP prévus (ex. `propose_career`, `propose_mail`), jamais en direct.

## Avant de livrer

1. Ce qui est déterministe est-il du code ? → relire le prompt, retirer chaque règle calculable.
2. Un seul run par action explicite ? → test : cliquer les choix ne crée aucun run.
3. Réponse invalide gérée ? → test serveur avec élément inconnu et sans `headline`.
4. Coût mesuré ? → tokens d'un vrai run notés dans le commit.
5. Web et Android, notification, traductions ? → vérif navigateur + build Android.
