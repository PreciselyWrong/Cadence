# Plan : le résumé du jour passe à Hermes

Décision du 2026-11-12 : Cadence ne génère plus ni n'affiche le résumé du jour. Les agents Hermes envoient le résumé du matin et le bilan du soir comme messages de la Boîte des agents (plugin Hermes, `cadence-inbox`). Ce tableau dit ce que devient chaque fonction retirée.

Règle : déterministe = code. Les calculs (charge, conflits, priorités, dates candidates, bilan du soir) restent du code ; l'agent ne fait que juger, rédiger et façonner la page.

| Fonction retirée de Cadence | Recréée par | Comment |
|---|---|---|
| Génération chaque matin (job `daily_brief`, heure, jours) | Cron Hermes | Job « Résumé du matin » (profil default), heure et jours dans le cron |
| Frise 3 jours, charge, surcharge, conflits, réunions sur les heures de travail | Code (moteur gardé) + bloc `stats`/`table` | Outil MCP en lecture seule qui renvoie les faits du jour ; le script de préparation du job les passe à l'agent |
| Priorités du jour (`tonight`), à déplacer (`moves`) et dates candidates | Code (moteur gardé) + boutons | Blocs `task` avec boutons `task.complete`, `task.postpone` (date proposée), « Autre date » par `reply` |
| Verdict (une phrase) | Agent | `header.title` / `header.subtitle`, à partir des chiffres du moteur |
| Réécriture par le LLM intégré, ton, consignes de style | Skill Hermes | Skill `cadence-inbox` + consignes du profil |
| Réponses mail attendues | Trieur (déjà) | Cartes Mail dans « À trier » ; le résumé des mails publie aussi dans la Boîte |
| Inbox à trier, doublons, dates dans les notes, tâches reportées | « À trier » (gardé) | Inchangé : les règles servent toujours le triage |
| Réglé (fait récemment) | Code (moteur gardé) | Dans les faits du jour, rendu en `list` |
| Bilan du soir (fait, glissé, à reporter, demain) | Cron Hermes + code | Job 20:30 ; `rules/evening` fournit les faits ; boutons Demain / C'est fait |
| Capacité du soir, notes par jour, seuils | Réglages du moteur gardés | Lus par l'outil MCP (`ui_settings.brief` gardé, sans écran) ; modifiables plus tard depuis la page du plugin |
| Mémoire : décisions, refus, contextes liés, bruit | Code (gardé) | Tables `brief_proposals` et `linked_contexts` lues par le moteur ; un bouton peut répondre à l'agent qui écrit le contexte par MCP |
| « Moins de ce type », vote utile / bruit | Agent + mémoire Hermes | Bouton `reply` « Moins de ce type » ; l'agent le note dans Mnemoteca et adapte sa consigne |
| Voix Piper (serveur et téléphone), lecteur, chapitres | Rien pour l'instant | Option : Hermes produit un MP3 (Piper) et l'envoie ; demanderait un bloc `audio` dans le plugin. À décider |
| Écran « Ma journée » (web, Android), carte d'Aujourd'hui | Boîte des agents + bandeau | Page du message (en-tête façonné, blocs), bandeau non lu sur toutes les pages |
| Régénérer | Agent | Bouton `reply` « Refaire le résumé » dans le message ; le chat relance l'agent |
| État des sources (`/brief/status`) | Onglet Jobs | Relevé des jobs Hermes, notification si un job échoue |

## Reste à construire

1. Cadence : outil MCP en lecture seule `get_day_overview(date)` (frise, charge, priorités, déplacements, alertes, réglé) et `get_evening_review(date)`, branchés sur le moteur gardé ; exposés à Herald par capgw (`policy.json`).
2. Hermes : script de préparation déterministe qui appelle ces outils et passe les faits à l'agent ; jobs « Résumé du matin » (07:15) et « Bilan du soir » (20:30) avec le skill `cadence-inbox` ; livraison à `/api/plugins/hermes/x/inbox`.
3. Hermes : job horaire du relevé des jobs ; les jobs utiles existants publient aussi dans la Boîte.
