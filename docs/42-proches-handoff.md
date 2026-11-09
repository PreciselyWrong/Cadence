# Remise de tâche depuis Proches

Proches, l'app de suivi des proches, peut confier une tâche à Cadence : la proposition acceptée devient une tâche Cadence avec son échéance, qui rejoint la file de synchronisation comme une tâche saisie à la main. Entrée inter-applications **Android seulement** : le web n'a pas d'équivalent, donc rien à reprendre dans `WEB-UX-NOTES.md`.

**Liens :** [Synchronisation hors ligne](30-offline-sync.md), [Tâches](00-tasks-behavior.md), [Android](../android/AGENTS.md)

Code : `android/domain/.../domain/handoff/ProchesHandoff.kt` (règles pures), `android/tasks/.../tasks/handoff/` (fournisseur `ProchesHandoffProvider`, vérification de l'appelant `ProchesCaller`, création `ProchesTaskHandoff`).

## Contrat

Proches appelle `contentResolver.call("content://ch.nicolab.cadence.handoff", "create_task", null, extras)` avec trois extras texte :

| Extra | Contenu | Règle |
|---|---|---|
| `proposal_id` | identifiant de la proposition Proches | non vide, 100 caractères au plus |
| `title` | titre de la tâche | rognée, non vide, 200 caractères au plus |
| `due_date` | échéance | `AAAA-MM-JJ`, date réelle |

Réponse : un Bundle avec `accepted` (booléen).

- `accepted = true` : la tâche est enregistrée, ou elle l'était déjà pour ce `proposal_id`.
- `accepted = false` : appelant refusé, demande invalide, délai dépassé ou méthode inconnue. Rien n'est écrit.

Proches affiche « Cadence n'est pas installée » quand l'autorité n'existe pas, et garde la proposition ouverte à chaque refus.

## Appelant vérifié

Le fournisseur ne répond qu'à `ch.nicolab.proches` signé par le certificat attendu (SHA-256 `a67a939e077c87e0ab78f36b21e1469af33a14d03d55fd559df980279471b1e0`). Trois contrôles, tous requis :

1. le nom du paquet appelant (`callingPackage`) vaut `ch.nicolab.proches` ;
2. tous les certificats de signature du paquet correspondent (au moins un) ; sur Android 9 et plus, la liste vient de `apkContentsSigners`, avant, de `GET_SIGNATURES` ;
3. la comparaison ignore la casse et les deux-points.

Tout autre appelant est refusé et ne laisse qu'une ligne de journal sans donnée (« appelant non autorisé »).

Changer de clé de signature côté Proches impose de mettre à jour la constante `ALLOWED_CERTIFICATE_SHA256` dans `ProchesHandoff.kt` et de publier une nouvelle version de Cadence.

## Création

- L'uid de la tâche est dérivé du `proposal_id` (`UUID.nameUUIDFromBytes("proches-handoff:" + id)`) : une même proposition ne crée jamais deux tâches, même remise deux fois.
- Si la tâche existe déjà, rien n'est écrit et la réponse reste `accepted = true`.
- Sinon, la création passe par le même chemin que la saisie de l'interface (`TaskRepository.createTask`) : ligne Room, opération dans la file d'envoi, synchronisation au passage suivant. Hors ligne, la tâche attend le réseau comme les autres.
- L'échéance est une date sans heure.

L'appel reste synchrone côté Proches, dans une limite de 5 secondes côté Cadence : au-delà, la réponse est `accepted = false` et Proches garde la proposition ouverte.

## Limites

- Une tâche supprimée puis remise à nouveau pour la même proposition serait recréée localement ; le serveur refuse de recréer un uid supprimé, donc l'opération est rejetée. Cas rare, car une proposition ne se remet qu'une fois.
- Pas de rappel ni d'heure : la remise ne porte qu'une date.
- Vérification sur l'émulateur ou le téléphone à faire à la main (aucun test automatique de la signature).
