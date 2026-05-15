"""Detect whether the CLI is running inside a Docker container."""

from __future__ import annotations

from pathlib import Path

DOCKER_MARKER = Path("/.dockerenv")


def is_docker_environment() -> bool:
    """Return True if /.dockerenv exists (the canonical Docker container marker)."""
    return DOCKER_MARKER.exists()
