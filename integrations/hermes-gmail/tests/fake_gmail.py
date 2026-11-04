"""In-memory stand-in for Google's OAuth and Gmail endpoints. No network."""

import base64
import email
import email.policy
import itertools
import json
import urllib.parse

ACCESS_TOKEN = "fake-access-token-VALUE"
REFRESH_TOKEN = "fake-refresh-token-VALUE"
SCOPE = "https://www.googleapis.com/auth/gmail.modify"
BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


def b64(text):
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def header_list(headers):
    return [{"name": k, "value": v} for k, v in headers.items()]


def plain_message(msg_id, thread_id, headers, text, labels=("INBOX",)):
    return {"id": msg_id, "threadId": thread_id, "labelIds": list(labels), "snippet": text[:40],
            "payload": {"mimeType": "text/plain", "headers": header_list(dict(headers, **{"Content-Type": "text/plain; charset=utf-8"})),
                        "body": {"data": b64(text), "size": len(text)}}}


def html_message(msg_id, thread_id, headers, html, attachment_name=None, labels=("INBOX",)):
    parts = [{"mimeType": "text/html", "filename": "", "headers": [{"name": "Content-Type", "value": "text/html; charset=utf-8"}],
              "body": {"data": b64(html), "size": len(html)}}]
    if attachment_name:
        parts.append({"mimeType": "application/pdf", "filename": attachment_name,
                      "headers": [{"name": "Content-Disposition", "value": f'attachment; filename="{attachment_name}"'}],
                      "body": {"attachmentId": "ATT1", "size": 1234}})
    return {"id": msg_id, "threadId": thread_id, "labelIds": list(labels), "snippet": "html",
            "payload": {"mimeType": "multipart/mixed", "headers": header_list(headers), "parts": parts}}


class FakeGoogle:
    def __init__(self):
        self.calls = []
        self.threads = {}
        self.drafts = {}
        self.ids = itertools.count(1)
        self.token_scope = SCOPE
        self.refresh_status = 200
        self.fail_next_create_with_timeout = False
        self.profile_address = "me@example.com"

    # Helpers for tests

    def add_thread(self, thread_id, messages):
        self.threads[thread_id] = list(messages)

    def human_edit(self, draft_id, new_text):
        draft = self.drafts[draft_id]
        old = draft["message"]
        draft["message"] = plain_message(f"m{next(self.ids)}", old["threadId"],
                                         {h["name"]: h["value"] for h in old["payload"]["headers"]}, new_text,
                                         labels=("DRAFT",))

    def gmail_calls(self, method=None):
        return [c for c in self.calls if c[1].startswith(BASE) and (method is None or c[0] == method)]

    # Transport

    def fetch(self, method, url, headers, body=None, timeout=30):
        self.calls.append((method, url, dict(headers), body))
        if url == "https://oauth2.googleapis.com/token":
            return self._token(body)
        assert url.startswith(BASE), url
        assert headers.get("Authorization") == "Bearer " + ACCESS_TOKEN
        split = urllib.parse.urlsplit(url)
        path = split.path[len("/gmail/v1/users/me"):]
        query = urllib.parse.parse_qs(split.query)
        payload = json.loads(body) if body else None
        return self._gmail(method, path, query, payload)

    def _token(self, body):
        form = urllib.parse.parse_qs(body.decode())
        if self.refresh_status != 200:
            return self.refresh_status, json.dumps({"error": "invalid_grant", "error_description": "secret detail"}).encode()
        result = {"access_token": ACCESS_TOKEN, "expires_in": 3600, "scope": self.token_scope, "token_type": "Bearer"}
        if form["grant_type"] == ["authorization_code"]:
            result["refresh_token"] = REFRESH_TOKEN
        return 200, json.dumps(result).encode()

    def _json(self, data, status=200):
        return status, json.dumps(data).encode()

    def _gmail(self, method, path, query, payload):
        parts = path.strip("/").split("/")
        if method == "GET" and parts == ["profile"]:
            return self._json({"emailAddress": self.profile_address})
        if parts[0] == "threads":
            if method == "GET" and len(parts) == 1:
                ids = list(self.threads)[: int(query.get("maxResults", ["10"])[0])]
                return self._json({"threads": [{"id": t, "snippet": "snip " + t} for t in ids]})
            thread = self.threads.get(parts[1])
            if thread is None:
                return self._json({"error": {"code": 404}}, 404)
            if method == "GET":
                fmt = query.get("format", ["full"])[0]
                messages = [self._format(m, fmt, query.get("metadataHeaders")) for m in self._with_drafts(parts[1])]
                return self._json({"id": parts[1], "messages": messages})
            if method == "POST" and parts[2:] == ["modify"]:
                for message in thread:
                    labels = [l for l in message["labelIds"] if l not in payload.get("removeLabelIds", [])]
                    labels += [l for l in payload.get("addLabelIds", []) if l not in labels]
                    message["labelIds"] = labels
                return self._json({"id": parts[1], "messages": [{"id": m["id"], "labelIds": m["labelIds"]} for m in thread]})
        if parts[0] == "drafts":
            if method == "GET" and len(parts) == 1:
                return self._json({"drafts": [{"id": d, "message": {"id": v["message"]["id"], "threadId": v["message"]["threadId"]}}
                                              for d, v in self.drafts.items()]})
            if method == "POST" and len(parts) == 1:
                draft_id = f"r{next(self.ids)}"
                self.drafts[draft_id] = {"id": draft_id, "message": self._from_raw(payload["message"])}
                if self.fail_next_create_with_timeout:
                    self.fail_next_create_with_timeout = False
                    from gmail_restricted.netio import NetworkTimeout
                    raise NetworkTimeout("simulated")
                return self._json({"id": draft_id, "message": {"id": self.drafts[draft_id]["message"]["id"]}})
            draft = self.drafts.get(parts[1])
            if draft is None:
                return self._json({"error": {"code": 404}}, 404)
            if method == "GET":
                return self._json(draft)
            if method == "PUT":
                draft["message"] = self._from_raw(payload["message"])
                return self._json({"id": parts[1], "message": {"id": draft["message"]["id"]}})
        raise AssertionError(f"unexpected Gmail call {method} {path}")

    def _with_drafts(self, thread_id):
        return self.threads[thread_id] + [d["message"] for d in self.drafts.values() if d["message"]["threadId"] == thread_id]

    def _format(self, message, fmt, metadata_headers):
        if fmt == "metadata":
            wanted = {h.lower() for h in (metadata_headers or [])}
            headers = [h for h in message["payload"]["headers"] if h["name"].lower() in wanted]
            return {"id": message["id"], "threadId": message["threadId"], "labelIds": message["labelIds"],
                    "snippet": message.get("snippet", ""), "payload": {"headers": headers}}
        return message

    def _from_raw(self, message):
        raw = base64.urlsafe_b64decode(message["raw"] + "=" * (-len(message["raw"]) % 4))
        parsed = email.message_from_bytes(raw, policy=email.policy.default)
        text = parsed.get_content()
        headers = {k: str(v) for k, v in parsed.items() if k.lower() in ("to", "cc", "subject", "in-reply-to", "references")}
        result = plain_message(f"m{next(self.ids)}", message["threadId"], headers, text, labels=("DRAFT",))
        result["raw_headers"] = dict(parsed.items())
        return result
