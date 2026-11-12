"""Streamable HTTP transport (MCP 2025-06-18 subset), standard library only.

One endpoint, POST only, JSON responses (no server-sent events, no session). Every request
needs `Authorization: Bearer <token>`; the token is read once from a private file. An optional
second token opens only `archive_thread` (for Cadence's mail cards), refused in this layer. Requests
carrying an Origin header are refused: no browser may talk to this server, so no CORS.
"""

import hmac
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .oauth import AuthError, _check_private
from .server import SUPPORTED_VERSIONS, _error, _log

ENDPOINT = "/mcp"
MAX_BODY_BYTES = 1024 * 1024
MIN_TOKEN_LENGTH = 32
SOCKET_TIMEOUT = 30
# What the archive-only token may ask: the handshake, and one tool.
ARCHIVE_METHODS = ("initialize", "ping", "notifications/initialized")
ARCHIVE_TOOL = "archive_thread"


def read_token(path):
    """The bearer token, from a regular file owned by this user and not readable by others."""
    _check_private(path, is_dir=False)
    with open(path, encoding="utf-8") as handle:
        token = handle.read().strip()
    if len(token) < MIN_TOKEN_LENGTH or any(c.isspace() for c in token):
        raise AuthError(f"jeton d'accès HTTP trop court ou mal formé (au moins {MIN_TOKEN_LENGTH} caractères)")
    return token


class _Handler(BaseHTTPRequestHandler):
    server_version = "gmail-restricted"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = SOCKET_TIMEOUT

    def log_message(self, format, *args):
        pass

    def _reply(self, status, payload=None, extra_headers=()):
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        if payload is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in extra_headers:
            self.send_header(name, value)
        self.end_headers()
        if body:
            self.wfile.write(body)
        _log(f"http {self.command} {status}")

    def _refuse(self, status, reason, extra_headers=()):
        self.close_connection = True  # an unread body must not be parsed as the next request
        self._reply(status, {"error": reason}, [("Connection", "close"), *extra_headers])

    def _scope(self):
        """'full', 'archive', or None when no token matches."""
        header = self.headers.get("Authorization", "")
        scheme, _, presented = header.partition(" ")
        presented = presented.strip().encode()
        # Compare every token, even on a wrong scheme, so timing does not reveal which part failed.
        full = hmac.compare_digest(presented, self.server.token.encode())
        archive = self.server.archive_token is not None and hmac.compare_digest(
            presented, self.server.archive_token.encode())
        if scheme.lower() != "bearer":
            return None
        return "full" if full else "archive" if archive else None

    @staticmethod
    def _archive_allows(message):
        method = message.get("method")
        if method in ARCHIVE_METHODS:
            return True
        params = message.get("params")
        return method == "tools/call" and isinstance(params, dict) and params.get("name") == ARCHIVE_TOOL

    def _precheck(self):
        """Common gate for every method; returns True when the request may proceed."""
        if self.headers.get("Origin") is not None:
            self._refuse(403, "origin_refused")
            return False
        if self.path != ENDPOINT:
            self._refuse(404, "not_found")
            return False
        self.scope = self._scope()
        if self.scope is None:
            self._refuse(401, "unauthorized", [("WWW-Authenticate", "Bearer")])
            return False
        version = self.headers.get("MCP-Protocol-Version")
        if version is not None and version not in SUPPORTED_VERSIONS:
            self._refuse(400, "unsupported_protocol_version")
            return False
        return True

    def do_GET(self):
        if self._precheck():
            self._refuse(405, "method_not_allowed", [("Allow", "POST")])

    def do_POST(self):
        if not self._precheck():
            return
        if self.headers.get("Transfer-Encoding") is not None:
            self._refuse(411, "length_required")
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._refuse(411, "length_required")
            return
        if length < 0:
            self._refuse(400, "bad_request")
            return
        if length > self.server.max_body:
            self._refuse(413, "payload_too_large")
            return
        content_type = self.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if content_type != "application/json":
            self._refuse(415, "unsupported_media_type")
            return
        raw = self.rfile.read(length)
        try:
            message = json.loads(raw)
        except ValueError:
            self._reply(400, _error(None, -32700, "Parse error"))
            return
        if not isinstance(message, dict):
            self._reply(400, _error(None, -32600, "Invalid Request"))
            return
        if "method" not in message:
            self._reply(202)  # a client response to a server request: none are ever made
            return
        if self.scope == "archive" and not self._archive_allows(message):
            self._refuse(403, "tool_not_allowed")
            return
        try:
            with self.server.call_lock:
                response = self.server.mcp.handle(message)
        except Exception as error:  # never echo internals that could hold data
            _log(f"internal error: {type(error).__name__}")
            response = _error(message.get("id"), -32603, "Internal error")
        if response is None:
            self._reply(202)
        else:
            self._reply(200, response)


class HttpServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, mcp_server, token, max_body=MAX_BODY_BYTES, archive_token=None):
        super().__init__(address, _Handler)
        self.mcp = mcp_server
        self.token = token
        self.archive_token = archive_token
        self.max_body = max_body
        self.call_lock = threading.Lock()  # tool calls run one at a time, like the stdio transport


def serve(mcp_server, bind, port, token_file, archive_token_file=None):
    token = read_token(token_file)
    archive_token = read_token(archive_token_file) if archive_token_file else None
    if archive_token is not None and hmac.compare_digest(archive_token.encode(), token.encode()):
        raise AuthError("le jeton d'archivage doit différer du jeton complet")
    httpd = HttpServer((bind, port), mcp_server, token, archive_token=archive_token)
    _log(f"listening on {bind}:{httpd.server_address[1]}{ENDPOINT} (pid {os.getpid()})")
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
