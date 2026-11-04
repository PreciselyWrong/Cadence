"""Local record of the drafts this server created, and of idempotency keys.

Only drafts recorded here may be updated. Each record keeps the version (Gmail message id)
last written or read by this server: any other version means someone else edited the draft.
"""

import contextlib
import fcntl
import json
import os
import time

from .oauth import write_private_json


class Ledger:
    def __init__(self, state_dir, clock=time.time):
        self.path = os.path.join(state_dir, "ledger.json")
        self.lock_path = os.path.join(state_dir, "ledger.lock")
        self.clock = clock

    @contextlib.contextmanager
    def locked(self):
        """Exclusive across processes; yields the data and saves it on success."""
        fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            data = self._load()
            yield data
            write_private_json(self.path, data)
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)

    def save(self, data):
        """Persist mid-operation; only call while holding locked()."""
        write_private_json(self.path, data)

    def _load(self):
        if not os.path.exists(self.path):
            return {"format": 1, "accounts": {}}
        with open(self.path, encoding="utf-8") as handle:
            return json.load(handle)

    def read(self):
        with self.locked() as data:
            return json.loads(json.dumps(data))

    @staticmethod
    def account(data, account):
        return data["accounts"].setdefault(account, {"drafts": {}, "keys": {}})
