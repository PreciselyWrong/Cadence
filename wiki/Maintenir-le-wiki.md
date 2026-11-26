# Maintenir le wiki

Le wiki est tenu dans le dépôt, à côté du code qu'il décrit, pour qu'une fonctionnalité et sa page changent dans le même commit.

## Où sont les fichiers

| Quoi | Où |
| --- | --- |
| Pages | `wiki/<Titre-De-La-Page>.md` (lien interne : `[texte](Titre-De-La-Page)`) |
| Sommaire et pied de page | `wiki/_Sidebar.md`, `wiki/_Footer.md` |
| Captures propres au wiki | `wiki/images/<nom>.png` |
| Captures du README, réutilisées | `screenshots/web/*.png`, publiées sous `images/web/` |
| Détail technique | `docs/` (le wiki y renvoie, sans le recopier) |

## Quand modifier une page

- Une fonctionnalité visible est ajoutée, retirée ou change de comportement, de libellé, de délai ou de limite.
- Un nouveau cas particulier est découvert (conflit, hors ligne, suppression).
- Une capture ne correspond plus à l'écran.

Une nouvelle page s'ajoute aussi à `wiki/_Sidebar.md` et à `wiki/Home.md`.

## Refaire les captures

Les captures viennent du compte de démonstration fictif (`npm run db:seed:screenshots`), sur une paire de serveurs jetable (ports 3312 et 4180) :

```bash
node scripts/screenshots/web.js --wiki
```

Nommer les captures à refaire pour ne prendre qu'elles : `node scripts/screenshots/web.js --wiki palette inbox`. Procédure complète : [docs/fork/SCREENSHOTS.md](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/SCREENSHOTS.md).

## Publier

```bash
scripts/publish-wiki.sh
```

`scripts/publish-prod.sh` le lance à chaque mise en production ; on peut aussi le lancer seul. Il recopie `wiki/` et les captures du README dans le dépôt du wiki GitHub, commite et pousse. `--plan` montre ce qu'il ferait. Une modification faite directement sur GitHub est écrasée à la publication suivante.

## Règles d'écriture

- En français, pour un utilisateur : ce que ça fait, comment s'en servir, ce qui se passe dans les cas particuliers.
- Les libellés cités sont ceux de l'interface (`public/locales/fr/`).
- Données fictives seulement (`example.com`), aucun chemin, hôte ou nom réel : le dépôt est public.
