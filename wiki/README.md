# Source du wiki

Ces pages sont la source du [wiki GitHub](https://github.com/PreciselyWrong/cadence/wiki). On les modifie ici, dans le même commit que la fonctionnalité, puis `scripts/publish-wiki.sh` les publie. Ne pas éditer le wiki depuis GitHub : la publication suivante écraserait la modification.

- Une page par sujet, en français, nom de fichier `Titre-De-La-Page.md` (lien : `[texte](Titre-De-La-Page)`).
- Captures : `images/<nom>.png`, prises sur le compte de démo par `node scripts/screenshots/web.js --wiki` ; celles du README sont publiées sous `images/web/`.
- Le détail technique reste dans `docs/` : la page y renvoie par un lien absolu vers `https://github.com/PreciselyWrong/cadence/blob/main/docs/...`.
