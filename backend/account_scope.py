"""Per-request gallery root used when Usgromana accounts are installed."""

from __future__ import annotations

import contextvars
from contextlib import contextmanager

_account_root: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "usg_gallery_account_root",
    default=None,
)


def peek_account_root() -> str | None:
    return _account_root.get()


@contextmanager
def use_account_root(path: str | None):
    token = _account_root.set(path)
    try:
        yield
    finally:
        _account_root.reset(token)
