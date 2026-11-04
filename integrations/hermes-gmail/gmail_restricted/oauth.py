"""OAuth for one Gmail scope: private file storage, refresh, and the user-run consent helpers.

Token values never leave this module except as the Authorization header built by the
Gmail transport. Errors carry Google's short error code only, never a response body.
"""

import base64
import hashlib
import json
import os
import re
import secrets
import stat
import time
import urllib.parse

from . import netio

SCOPE = "https://www.googleapis.com/auth/gmail.modify"
AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
REDIRECT_URI = "http://127.0.0.1:8765/"
ACCOUNT_KEY = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")


class AuthError(Exception):
    """The account cannot be used until the user reconnects it."""


def _check_private(path, is_dir):
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode):
        raise AuthError(f"{os.path.basename(path)} est un lien symbolique : refusé")
    if is_dir != stat.S_ISDIR(info.st_mode):
        raise AuthError(f"{os.path.basename(path)} n'a pas le type attendu")
    if info.st_uid != os.getuid():
        raise AuthError(f"{os.path.basename(path)} n'appartient pas à l'utilisateur du serveur")
    if info.st_mode & 0o077:
        raise AuthError(f"permissions trop larges sur {os.path.basename(path)} (attendu 700/600)")


def write_private_json(path, data):
    """Atomic write with mode 600, created that way (no window with wider permissions)."""
    tmp = f"{path}.tmp-{os.getpid()}"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


class TokenStore:
    """<state_dir>/client_secret.json and <state_dir>/tokens/<account>.json, all private."""

    def __init__(self, state_dir):
        self.state_dir = os.path.abspath(state_dir)
        self.tokens_dir = os.path.join(self.state_dir, "tokens")
        self.client_path = os.path.join(self.state_dir, "client_secret.json")

    def ensure_dirs(self):
        for directory in (self.state_dir, self.tokens_dir):
            os.makedirs(directory, mode=0o700, exist_ok=True)
            _check_private(directory, is_dir=True)

    def check_state_dir(self):
        if not os.path.isdir(self.state_dir):
            raise AuthError("répertoire d'état absent : lancer setup_oauth.py")
        _check_private(self.state_dir, is_dir=True)

    def token_path(self, account):
        if not ACCOUNT_KEY.match(account or ""):
            raise AuthError("clé de compte invalide")
        return os.path.join(self.tokens_dir, f"{account}.json")

    def _read(self, path, missing_message):
        _check_private(self.state_dir, is_dir=True)
        if not os.path.exists(path):
            raise AuthError(missing_message)
        _check_private(os.path.dirname(path), is_dir=True)
        _check_private(path, is_dir=False)
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    def load_client(self):
        data = self._read(self.client_path, "client OAuth absent : importer le fichier client (setup_oauth.py --import-client)")
        return parse_client(data)

    def save_client(self, client_json):
        self.ensure_dirs()
        parse_client(client_json)
        write_private_json(self.client_path, client_json)

    def load_token(self, account):
        data = self._read(self.token_path(account), "compte non connecté : lancer setup_oauth.py pour ce compte")
        if not data.get("refresh_token"):
            raise AuthError("jeton de rafraîchissement absent : relancer setup_oauth.py")
        return data

    def save_token(self, account, data):
        self.ensure_dirs()
        write_private_json(self.token_path(account), data)


def parse_client(data):
    """Accept only a Google 'Desktop app' client file."""
    installed = data.get("installed") if isinstance(data, dict) else None
    if not isinstance(installed, dict):
        raise AuthError("fichier client inattendu : créer un client OAuth de type « Application de bureau »")
    client_id, client_secret = installed.get("client_id"), installed.get("client_secret")
    if not client_id or not client_secret:
        raise AuthError("fichier client incomplet (client_id/client_secret)")
    return {"client_id": client_id, "client_secret": client_secret}


def check_granted_scope(scope_field):
    granted = set((scope_field or "").split())
    if granted != {SCOPE}:
        raise AuthError("Google a accordé d'autres droits que gmail.modify : jeton refusé")


def _post_token(form, fetch):
    body = urllib.parse.urlencode(form).encode()
    headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
    try:
        status, raw = fetch("POST", TOKEN_URI, headers, body, 30)
    except (netio.NetworkTimeout, netio.NetworkError):
        raise AuthError("serveur OAuth injoignable, réessayer plus tard") from None
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        payload = {}
    if status != 200:
        code = payload.get("error") if isinstance(payload, dict) else None
        if code == "invalid_grant":
            raise AuthError("autorisation OAuth expirée ou révoquée : relancer setup_oauth.py")
        raise AuthError(f"échec OAuth ({status} {code or 'erreur'})")
    return payload


class AccessTokens:
    """Short-lived access tokens, kept in memory only."""

    def __init__(self, store, fetch=netio.fetch, clock=time.time):
        self.store = store
        self.fetch = fetch
        self.clock = clock
        self._cache = {}

    def invalidate(self, account):
        self._cache.pop(account, None)

    def get(self, account):
        cached = self._cache.get(account)
        if cached and cached[1] - 60 > self.clock():
            return cached[0]
        client = self.store.load_client()
        token = self.store.load_token(account)
        payload = _post_token(
            {
                "grant_type": "refresh_token",
                "refresh_token": token["refresh_token"],
                "client_id": client["client_id"],
                "client_secret": client["client_secret"],
            },
            self.fetch,
        )
        if "scope" in payload:
            check_granted_scope(payload["scope"])
        access = payload.get("access_token")
        if not access:
            raise AuthError("réponse OAuth sans jeton d'accès")
        if payload.get("refresh_token") and payload["refresh_token"] != token["refresh_token"]:
            token["refresh_token"] = payload["refresh_token"]
            self.store.save_token(account, token)
        self._cache[account] = (access, self.clock() + int(payload.get("expires_in", 3600)))
        return access


def new_pkce():
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def consent_url(client_id, state, challenge, login_hint=None):
    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URI}?{urllib.parse.urlencode(params)}"


def code_from_paste(pasted, expected_state):
    """Accept the full redirect URL (state checked) or, failing that, the bare code."""
    pasted = (pasted or "").strip()
    if pasted.startswith("http://") or pasted.startswith("https://"):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(pasted).query)
        if "error" in query:
            raise AuthError(f"consentement refusé ({query['error'][0]})")
        if query.get("state", [None])[0] != expected_state:
            raise AuthError("paramètre state différent : recommencer depuis une nouvelle URL")
        code = query.get("code", [None])[0]
    else:
        code = pasted
    if not code or not re.match(r"^[A-Za-z0-9/._~+-]{10,512}$", code):
        raise AuthError("code d'autorisation introuvable dans le texte collé")
    return code


def exchange_code(client, code, verifier, fetch=netio.fetch):
    payload = _post_token(
        {
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": REDIRECT_URI,
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
        },
        fetch,
    )
    check_granted_scope(payload.get("scope"))
    if not payload.get("refresh_token"):
        raise AuthError("Google n'a pas fourni de jeton de rafraîchissement : retirer l'accès de l'app dans le compte Google puis recommencer")
    return payload
