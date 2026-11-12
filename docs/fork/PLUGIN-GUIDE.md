# Guide : créer un plugin Cadence

Référence du contrat : [docs/46-plugins.md](../46-plugins.md). Ce guide est le pas-à-pas. Exemple réel : le plugin Hermes (dépôt `cadence-plugin-hermes`).

## Avant de commencer

- Un plugin est un **module Node (CommonJS) exécuté dans le serveur Cadence**, avec ses droits. Écris-le comme du code de confiance et lis tout plugin tiers avant de l'allumer.
- Il vit dans **son propre dépôt Git** : version, tags et mises à jour sont les siens.
- Ce qui doit être isolé (autre langage, autre machine) ne se met pas en plugin : utilise un webhook et une clé d'API.
- Pas de `npm install` côté Cadence : **zéro dépendance** (ce que fournit Node 20+ : `fetch`, `node:crypto`…) ou dépendances embarquées (bundle d'un seul fichier, ou `node_modules` commité).

## 1. Squelette (2 fichiers)

```
cadence-plugin-hello/
  cadence-plugin.json
  index.js
```

`cadence-plugin.json` :

```json
{
    "id": "hello",
    "name": "Hello",
    "version": "1.0.0",
    "apiVersion": 1,
    "description": "Dit bonjour à chaque tâche créée.",
    "main": "index.js",
    "permissions": ["events", "routes"],
    "events": ["task.created"],
    "settings": [
        {
            "key": "greeting",
            "type": "string",
            "label": "Message",
            "default": "Bonjour"
        }
    ]
}
```

Règles : `id` en `a-z0-9-` (2 à 32 caractères, ne change plus jamais : il sert d'URL et de clé de stockage) ; `version` en `x.y.z` ; `apiVersion` = `1` ; `main` reste dans le dossier. Liste complète : tableau « Manifest » de `docs/46-plugins.md`.

`index.js` :

```js
module.exports = {
    async activate(ctx) {
        ctx.on('task.created', async (event) => {
            ctx.logger.info(
                { task: event.data?.task?.uid },
                ctx.settings.get('greeting')
            );
        });

        ctx.router.get('/hello', (req, res) => {
            res.json({
                message: ctx.settings.get('greeting'),
                user: req.currentUser.id,
            });
        });
    },

    async deactivate() {},
};
```

## 2. Ce que `ctx` te donne

| Besoin                | API                                                                                             | Permission                           |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| Réagir à un événement | `ctx.on('task.created', handler)` : `handler({ id, name, userId, text, data, at })`             | `events` + l'événement dans `events` |
| Exposer des routes    | `ctx.router` (Express) servi à `/api/plugins/<id>/x/…`, `req.currentUser`                       | `routes`                             |
| Réglages              | `ctx.settings.get(k)` / `.all()` (lus à chaque appel : un changement s'applique sans recharger) | aucune                               |
| État persistant       | `ctx.storage.get/set/delete` (JSON, 64 Ko en tout)                                              | aucune                               |
| Journal               | `ctx.logger.info/warn/error(objet, message)`                                                    | aucune                               |
| Nettoyage             | `ctx.onDispose(fn)` : timers, sockets, à la désactivation ou au rechargement                    | aucune                               |

Événements disponibles : ceux des webhooks (`task.created`, `task.completed`, `task.updated`, `note.created`, `link.created`, `daily_summary`, rappels…, voir `docs/27-webhooks.md`). Déclarer dans le manifeste ce que `ctx.on` demande : un événement non déclaré fait échouer l'activation.

## 3. Réglages

Types : `string`, `secret`, `boolean`, `number`, `select` (avec `options`). Le formulaire est généré dans Profil › Plugins (web et Android). Un `secret` est chiffré en base, jamais renvoyé au navigateur ; `required: true` empêche d'allumer tant qu'il est vide. Lis toujours via `ctx.settings`, pas via une copie au démarrage.

## 4. Une entrée de menu et une page

Ajoute au manifeste :

```json
"menu": { "label": "Hello", "page": "ui/index.html" }
```

et un `ui/index.html`. L'entrée apparaît dans la barre latérale (web) et le sélecteur de listes (Android) ; l'utilisateur peut la masquer ou la réordonner dans Profil › Barre latérale. **Seul le sous-dossier de `page` est servi** (`/api/plugins/<id>/ui/`) : ne mets rien de secret dedans.

La page s'exécute dans l'origine de Cadence, connectée comme l'utilisateur. Elle appelle tes routes en chemin relatif :

```html
<h1 id="t"></h1>
<script>
    fetch('/api/plugins/hello/x/hello')
        .then((r) => r.json())
        .then((d) => {
            document.getElementById('t').textContent = d.message;
        });
</script>
```

Écris-la pour un petit écran (elle s'ouvre aussi dans une WebView Android), sans dépendance externe. Préfère des routes **GET** pour la page ; les écritures (POST) depuis une page demandent le jeton CSRF sur le web et n'ont pas été vérifiées sur Android.

## 5. Bonnes pratiques

- **Un handler ne bloque pas** : il a 10 s. Pour un travail long (réseau avec réessais), lance-le sans l'attendre et note le résultat dans `ctx.storage` (voir Hermes, route `/status`).
- **Les erreurs d'un handler** sont enregistrées comme `last_error` du plugin et n'atteignent jamais Cadence ; `activate` qui échoue ou dépasse 10 s met le plugin en `error`.
- **Routes** : elles sont ouvertes à tout utilisateur connecté, pas seulement à l'admin. Vérifie ce que `req.currentUser` a le droit de voir ; ne renvoie jamais un secret ou une adresse de réglage.
- **Logs** : pas de secret ni de contenu de tâche dans les messages.
- **Idempotence** : un événement peut être rejoué si tu relances la livraison ; utilise `event.id` pour dédupliquer.
- **Permissions minimales** : une mise à jour qui en demande plus reste éteinte (`needs_approval`) jusqu'à nouvelle approbation par l'admin.

## 6. Tester

Sans Cadence, avec `node:test` et un faux `ctx` (modèle : `test/index.test.js` du plugin Hermes) :

```js
const test = require('node:test');
const assert = require('node:assert');
const { activate } = require('../index');

test('répond avec le réglage', async () => {
    const routes = {};
    const ctx = {
        settings: { get: () => 'Salut' },
        logger: { info() {} },
        on() {},
        router: { get: (p, h) => (routes[p] = h) },
    };
    await activate(ctx);
    let body;
    routes['/hello']({ currentUser: { id: 1 } }, { json: (b) => (body = b) });
    assert.equal(body.message, 'Salut');
});
```

Valider le manifeste avec le vrai parseur :

```bash
cd /chemin/vers/Cadence/backend && node -e "console.log(require('./modules/plugins/core/manifest').parseManifest(require('/chemin/vers/le/plugin/cadence-plugin.json')))"
```

## 7. Installer, mettre à jour, retirer

1. Pousse le dépôt (GitHub ou Gitea local ; adresse https, http ou ssh, sans identifiants dedans : clé SSH ou credential helper sur le serveur).
2. Cadence : Profil › Plugins › **Ajouter** (adresse Git). Le plugin arrive **éteint** : lis ce qu'il demande, renseigne les réglages, allume.
3. Nouvelle version : change `version`, pousse (un tag par version), puis **Mettre à jour** (pull fast-forward + rechargement). Facultatif : `"update": { "url": "https://…/cadence-plugin.json" }` pour que « Vérifier les mises à jour » compare avec la dernière version publiée.
4. Revenir en arrière : `git checkout <tag>` dans le dossier du plugin, puis **Recharger**.
5. **Supprimer** arrête le plugin et efface son dossier, ses réglages et son stockage.

Dev en local : place le dossier directement dans `TUDUDI_PLUGINS_DIR`, modifie, **Recharger**.

## 8. Pièges

- Changer l'`id` = un autre plugin (réglages perdus).
- Un `main` qui sort du dossier, un `menu.page` hors sous-dossier, un événement inconnu : le manifeste est `invalid`.
- Deux dossiers avec le même `id` : le second est `invalid`.
- Un timer non nettoyé survit au rechargement : passe par `ctx.onDispose`.
- Ne dépends pas de l'ordre de livraison des événements ni de leur exactitude absolue (pas de file durable côté plugin).
- Hébergé (`TUDUDI_HOSTED_MODE`) : les plugins sont désactivés.

## Checklist avant de publier

- [ ] Manifeste valide (commande du §6), `version` à jour, tag posé.
- [ ] Permissions et événements strictement nécessaires.
- [ ] Aucun secret ni référence privée dans le dépôt.
- [ ] Tests `node --test` verts.
- [ ] README : ce que ça fait, réglages, installation, retour arrière, avertissement « s'exécute dans le serveur ».
