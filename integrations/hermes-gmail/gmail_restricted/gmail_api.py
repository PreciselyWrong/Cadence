"""Gmail REST access limited to a fixed allowlist of routes and request bodies.

This is the execution-layer barrier: anything outside ROUTES is refused before a request
is built, whatever the caller asks for. There is no generic request method.
"""

import json
import re
import time
import urllib.parse

from . import netio
from .oauth import AuthError

API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_ID = r"[A-Za-z0-9_-]{1,128}"
ID_PATTERN = re.compile(rf"^{_ID}$")

# (method, path pattern, allowed query keys, body validator name)
ROUTES = (
    ("GET", re.compile(r"^/profile$"), frozenset(), None),
    ("GET", re.compile(r"^/threads$"), frozenset({"q", "maxResults"}), None),
    ("GET", re.compile(rf"^/threads/{_ID}$"), frozenset({"format", "metadataHeaders"}), None),
    ("POST", re.compile(rf"^/threads/{_ID}/modify$"), frozenset(), "inbox_label"),
    # Corbeille d'un fil entier, récupérable 30 jours dans Gmail. Jamais de suppression définitive.
    ("POST", re.compile(rf"^/threads/{_ID}/trash$"), frozenset(), None),
    ("GET", re.compile(r"^/drafts$"), frozenset({"maxResults", "pageToken"}), None),
    ("GET", re.compile(rf"^/drafts/{_ID}$"), frozenset({"format"}), None),
    ("POST", re.compile(r"^/drafts$"), frozenset(), "draft_create"),
    ("PUT", re.compile(rf"^/drafts/{_ID}$"), frozenset(), "draft_update"),
)
# Path segments that name Gmail actions this server must never reach, even as an id value.
REFUSED_SEGMENTS = frozenset(
    s.lower() for s in ("send", "untrash", "delete", "batchDelete", "batchModify", "import", "insert",
                        "watch", "stop", "settings", "labels", "messages", "attachments", "history")
)
FORMATS = frozenset({"full", "metadata", "minimal"})


class GmailError(Exception):
    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code = code
        self.status = status


class RefusedRequest(GmailError):
    def __init__(self, message):
        super().__init__("refused", message)


def _valid_inbox_label(body):
    return body in ({"addLabelIds": ["INBOX"]}, {"removeLabelIds": ["INBOX"]})


def _valid_draft_message(message):
    return (
        isinstance(message, dict)
        and set(message) == {"raw", "threadId"}
        and isinstance(message["raw"], str)
        and ID_PATTERN.match(str(message["threadId"]))
    )


def _valid_body(kind, path, body):
    if kind is None:
        return body is None
    if not isinstance(body, dict):
        return False
    if kind == "inbox_label":
        return _valid_inbox_label(body)
    if kind == "draft_create":
        return set(body) == {"message"} and _valid_draft_message(body["message"])
    if kind == "draft_update":
        return (set(body) == {"id", "message"} and path.rsplit("/", 1)[1] == body["id"]
                and _valid_draft_message(body["message"]))
    return False


def check_request(method, path, query=None, body=None):
    """Raise RefusedRequest unless (method, path, query, body) is explicitly allowed."""
    segments = [s.lower() for s in path.split("/") if s]
    if any(s in REFUSED_SEGMENTS for s in segments):
        raise RefusedRequest("opération Gmail non autorisée")
    query = query or {}
    for route_method, pattern, keys, body_kind in ROUTES:
        if method == route_method and pattern.match(path):
            if set(query) - keys:
                raise RefusedRequest("paramètre de requête non autorisé")
            if "format" in query and query["format"] not in FORMATS:
                raise RefusedRequest("format non autorisé")
            if not _valid_body(body_kind, path, body):
                raise RefusedRequest("corps de requête non autorisé")
            return
    raise RefusedRequest("opération Gmail non autorisée")


class GmailClient:
    """One account's Gmail access, through the allowlist only."""

    def __init__(self, account, tokens, fetch=netio.fetch, sleep=time.sleep):
        self.account = account
        self.tokens = tokens
        self.fetch = fetch
        self.sleep = sleep

    def _call(self, method, path, query=None, body=None):
        check_request(method, path, query, body)
        url = API_BASE + path
        if query:
            url += "?" + urllib.parse.urlencode(query, doseq=True)
        data = json.dumps(body).encode() if body is not None else None
        attempts = 2
        for attempt in range(attempts):
            headers = {"Authorization": "Bearer " + self.tokens.get(self.account), "Accept": "application/json"}
            if data is not None:
                headers["Content-Type"] = "application/json"
            try:
                status, raw = self.fetch(method, url, headers, data, 30)
            except netio.NetworkTimeout:
                if method == "GET" and attempt + 1 < attempts:
                    continue
                raise GmailError("timeout", "Gmail n'a pas répondu à temps ; le résultat d'une écriture est inconnu") from None
            except netio.NetworkError:
                raise GmailError("network", "Gmail injoignable") from None
            if status == 401 and attempt + 1 < attempts:
                self.tokens.invalidate(self.account)
                continue
            if (status == 429 or status >= 500) and method == "GET" and attempt + 1 < attempts:
                self.sleep(1)
                continue
            break
        if status == 401:
            raise AuthError("Gmail refuse le jeton : relancer setup_oauth.py")
        if status == 404:
            raise GmailError("not_found", "élément Gmail introuvable", status)
        if status == 403:
            raise GmailError("forbidden", "Gmail refuse l'opération (droits ou quota)", status)
        if status >= 400:
            raise GmailError("http", f"erreur Gmail {status}", status)
        try:
            return json.loads(raw or b"{}")
        except ValueError:
            raise GmailError("bad_response", "réponse Gmail illisible") from None

    def profile(self):
        return self._call("GET", "/profile")

    def list_threads(self, q, max_results):
        return self._call("GET", "/threads", {"q": q, "maxResults": max_results})

    def get_thread(self, thread_id, fmt, metadata_headers=None):
        query = {"format": fmt}
        if metadata_headers:
            query["metadataHeaders"] = list(metadata_headers)
        return self._call("GET", f"/threads/{thread_id}", query)

    def set_inbox(self, thread_id, in_inbox):
        body = {"addLabelIds": ["INBOX"]} if in_inbox else {"removeLabelIds": ["INBOX"]}
        return self._call("POST", f"/threads/{thread_id}/modify", body=body)

    def trash_thread(self, thread_id):
        return self._call("POST", f"/threads/{thread_id}/trash")

    def list_drafts(self, page_token=None):
        query = {"maxResults": 100}
        if page_token:
            query["pageToken"] = page_token
        return self._call("GET", "/drafts", query)

    def get_draft(self, draft_id):
        return self._call("GET", f"/drafts/{draft_id}", {"format": "full"})

    def create_draft(self, thread_id, raw):
        return self._call("POST", "/drafts", body={"message": {"raw": raw, "threadId": thread_id}})

    def replace_draft(self, draft_id, thread_id, raw):
        return self._call("PUT", f"/drafts/{draft_id}",
                          body={"id": draft_id, "message": {"raw": raw, "threadId": thread_id}})
