"""Entry point for Hermes (stdio). Run with `python -I`: only this directory is added to the path."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gmail_restricted.server import main  # noqa: E402

if __name__ == "__main__":
    main()
