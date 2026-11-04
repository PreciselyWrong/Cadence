"""Append-only audit log of tool calls: one JSON line per call, never any message content.

A line holds the UTC time, the tool name, the account key, an outcome code ("ok" or the error
code) and a hash of the thread id. No body, subject, address, draft text or token is written.
Names that are not a known tool or a valid account key are replaced, so a caller cannot write
arbitrary text into the log. Size-based rotation keeps ``backups`` older files (``.1`` is the
most recent).
"""

import hashlib
import json
import os
import re
import threading
import time

from .oauth import ACCOUNT_KEY
from .tools import TOOL_NAMES

OUTCOME_CODE = re.compile(r"^[a-z0-9_]{1,40}$")
DEFAULT_MAX_BYTES = 1_000_000
DEFAULT_BACKUPS = 5


def thread_hash(thread_id):
    return hashlib.sha256(thread_id.encode("utf-8")).hexdigest()[:16]


class AuditLog:
    def __init__(self, path, max_bytes=DEFAULT_MAX_BYTES, backups=DEFAULT_BACKUPS, clock=time.time):
        if backups < 1:
            raise ValueError("backups must be at least 1")
        self.path = path
        self.max_bytes = max_bytes
        self.backups = backups
        self.clock = clock
        self._lock = threading.Lock()

    def record(self, tool, arguments, result, is_error):
        """Append one line; raises OSError when the log cannot be written."""
        arguments = arguments if isinstance(arguments, dict) else {}
        account = arguments.get("account")
        thread_id = arguments.get("thread_id")
        outcome = (result or {}).get("error") if is_error else "ok"
        entry = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.clock())),
            "tool": tool if tool in TOOL_NAMES else "unknown",
            "account": None if account is None else (
                account if isinstance(account, str) and ACCOUNT_KEY.match(account) else "invalid"),
            "outcome": outcome if isinstance(outcome, str) and OUTCOME_CODE.match(outcome) else "error",
            "thread": thread_hash(thread_id) if isinstance(thread_id, str) and thread_id else None,
        }
        line = (json.dumps(entry, ensure_ascii=True) + "\n").encode("ascii")
        with self._lock:
            self._rotate_if_full(len(line))
            fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, line)
            finally:
                os.close(fd)

    def _rotate_if_full(self, incoming):
        try:
            size = os.path.getsize(self.path)
        except FileNotFoundError:
            return
        if size + incoming <= self.max_bytes:
            return
        for index in range(self.backups - 1, 0, -1):
            older = f"{self.path}.{index}"
            if os.path.exists(older):
                os.replace(older, f"{self.path}.{index + 1}")
        os.replace(self.path, f"{self.path}.1")
