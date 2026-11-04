# Piper pour le résumé matinal

Cadence lit le résumé matinal à voix haute avec un serveur Piper qui tourne sur ton réseau (docs/39-daily-brief.md, Audio). Cette image le fait tourner : `piper-tts[http]` 1.8.0, sur Python 3.12, sous un utilisateur non root.

## Construire

```bash
docker build -t cadence-piper docker/piper
```

## Télécharger une voix française (une seule fois)

Les voix sont stockées dans le volume `/voices`. Le téléchargement a besoin du réseau ; ensuite le serveur n'en a plus besoin.

```bash
docker volume create cadence-piper-voices
docker run --rm -v cadence-piper-voices:/voices cadence-piper \
  python -m piper.download_voices fr_FR-siwis-medium --data-dir /voices
```

Autres voix françaises, avec leur licence :

| Voix                              | Licence      |
| --------------------------------- | ------------ |
| `fr_FR-siwis-medium` (par défaut) | CC BY 4.0    |
| `fr_FR-upmc-medium`               | CC BY-SA 4.0 |
| `fr_FR-mls-medium`                | CC BY 4.0    |
| `fr_FR-gilles-medium`             | CC0          |
| `fr_FR-tom-medium`                | AGPL-3.0     |

Les voix CC BY et CC BY-SA demandent de citer l'auteur dans l'usage que tu en fais ; la voix `tom` est sous AGPL-3.0.

## Lancer

```bash
docker run -d --name cadence-piper --restart unless-stopped \
  -p 5000:5000 \
  -v cadence-piper-voices:/voices \
  -e PIPER_VOICE=fr_FR-siwis-medium \
  cadence-piper
```

Vérifier que le serveur répond et voir les voix disponibles :

```bash
curl http://localhost:5000/voices
```

Le port 5000 ne doit être accessible que depuis ton réseau local ou ton Tailscale. Le serveur n'a pas d'authentification.

## Brancher Cadence

Dans Cadence › Profil › Résumé › Voix :

1. Active la voix.
2. Renseigne l'adresse du serveur, par exemple `http://10.0.0.20:5000` ou `http://nas.tailnet.ts.net:5000`.
3. Choisis la voix (la liste vient du serveur) et la vitesse.
4. Écoute l'aperçu avant de valider.

Si le serveur ne répond pas, le résumé reste lisible : l'audio est marqué en échec et l'application peut lire le texte avec la synthèse vocale de l'appareil.
