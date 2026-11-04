"""Connexion d'un compte Gmail au serveur restreint. À lancer par l'utilisateur, jamais par un agent.

  1. Importer le client OAuth (fichier JSON « Application de bureau ») lu sur l'entrée standard :
       python -I setup_oauth.py --accounts A --state-dir S --import-client < client_secret.json
  2. Connecter un compte (interactif) :
       python -I setup_oauth.py --accounts A --state-dir S --account perso --address moi@example.com
  3. Vérifier un compte connecté :
       python -I setup_oauth.py --accounts A --state-dir S --account perso --check

Aucun jeton n'est affiché. Les fichiers secrets sont créés en 600 dans un répertoire 700.
"""

import argparse
import json
import os
import secrets
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gmail_restricted import netio, oauth  # noqa: E402
from gmail_restricted.gmail_api import GmailClient  # noqa: E402


class _FixedToken:
    def __init__(self, access_token):
        self.access_token = access_token

    def get(self, account):
        return self.access_token

    def invalidate(self, account):
        pass


def _read_accounts(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {"accounts": {}}


def _write_accounts(path, data):
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def import_client(store, stdin):
    try:
        data = json.loads(stdin.read())
    except ValueError:
        raise oauth.AuthError("entrée standard : JSON illisible") from None
    store.save_client(data)
    print("Client OAuth importé (contenu non affiché). Vous pouvez supprimer votre copie locale du fichier.")


def connect(store, accounts_path, account, address, login_hint, ask=input, fetch=netio.fetch, out=print):
    store.ensure_dirs()
    client = store.load_client()
    state = secrets.token_urlsafe(24)
    verifier, challenge = oauth.new_pkce()
    out("\n1. Ouvrez cette adresse dans un navigateur et connectez-vous au compte voulu :\n")
    out(oauth.consent_url(client["client_id"], state, challenge, login_hint or address))
    out("\n2. Google peut afficher « Google n'a pas validé cette application » : c'est attendu pour votre propre")
    out("   client. Choisissez « Paramètres avancés », puis « Accéder à … », puis autorisez l'accès Gmail.")
    out("3. Le navigateur arrive ensuite sur une page http://127.0.0.1:8765/… qui ne s'affiche pas : c'est normal.")
    out("   Copiez l'adresse complète de cette page depuis la barre d'adresse.\n")
    pasted = ask("Collez l'adresse ici puis Entrée : ")
    code = oauth.code_from_paste(pasted, state)
    payload = oauth.exchange_code(client, code, verifier, fetch=fetch)
    profile = GmailClient(account, _FixedToken(payload["access_token"]), fetch=fetch).profile()
    email_address = (profile.get("emailAddress") or "").lower()
    if address and email_address != address.lower():
        raise oauth.AuthError(f"compte connecté : {email_address}, attendu : {address} ; rien n'a été enregistré")
    store.save_token(account, {
        "refresh_token": payload["refresh_token"],
        "scope": payload.get("scope"),
        "address": email_address,
        "obtained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    data = _read_accounts(accounts_path)
    data.setdefault("accounts", {})[account] = {"address": email_address}
    _write_accounts(accounts_path, data)
    out(f"\nCompte « {account} » connecté ({email_address}), droits : gmail.modify uniquement.")


def check(store, account, fetch=netio.fetch, out=print):
    tokens = oauth.AccessTokens(store, fetch=fetch)
    profile = GmailClient(account, tokens, fetch=fetch).profile()
    out(f"Compte « {account} » opérationnel : {profile.get('emailAddress')}")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Connexion OAuth du serveur Gmail restreint.")
    parser.add_argument("--accounts", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--import-client", action="store_true", help="Lire le JSON du client OAuth sur stdin.")
    parser.add_argument("--account", help="Clé courte du compte (ex. perso), utilisée par l'agent.")
    parser.add_argument("--address", help="Adresse attendue ; refus si un autre compte est connecté.")
    parser.add_argument("--login-hint", help="Adresse proposée à l'écran de connexion Google.")
    parser.add_argument("--check", action="store_true", help="Vérifier un compte déjà connecté.")
    args = parser.parse_args(argv)
    os.umask(0o077)
    store = oauth.TokenStore(args.state_dir)
    try:
        if args.import_client:
            import_client(store, sys.stdin)
        elif args.account and args.check:
            check(store, args.account)
        elif args.account:
            if not oauth.ACCOUNT_KEY.match(args.account):
                raise oauth.AuthError("clé de compte : minuscules, chiffres, - ou _, 32 caractères au plus")
            connect(store, args.accounts, args.account, args.address, args.login_hint)
        else:
            parser.error("indiquer --import-client ou --account")
    except oauth.AuthError as error:
        print(f"Erreur : {error}", file=sys.stderr)
        return 1
    except Exception as error:  # GmailError and I/O: short message, no response bodies
        print(f"Erreur : {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
