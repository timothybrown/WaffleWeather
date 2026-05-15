"""CLI-local Settings loader.

Deliberately does NOT import app.database, which instantiates a
module-level Settings() at import time and would freeze env-file
resolution before --config-path can take effect.
"""

from __future__ import annotations

import os
from pathlib import Path

from app.config import Settings

DEFAULT_PROD_ENV = Path("/opt/waffleweather/.env")


def load_settings(env_path: Path | None = None) -> Settings:
    """Construct Settings with precedence: --config-path > WW_CLI_ENV > prod default > dev fallback."""
    if env_path is not None:
        return Settings(_env_file=str(env_path))
    if env_override := os.environ.get("WW_CLI_ENV"):
        return Settings(_env_file=env_override)
    if DEFAULT_PROD_ENV.exists():
        return Settings(_env_file=str(DEFAULT_PROD_ENV))
    return Settings()
