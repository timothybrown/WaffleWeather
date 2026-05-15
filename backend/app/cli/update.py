"""`waffleweather update` — tagged-release update with state machine.

Spec: docs/superpowers/specs/2026-05-14-waffleweather-cli-design.md
"""

from __future__ import annotations

import os
import stat
from importlib.metadata import PackageNotFoundError, version as pkg_version
from pathlib import Path

import click

from app.cli._docker import is_docker_environment
from app.cli._git import (
    STABLE_TAG_RE,
    current_tag,
    list_remote_tags,  # noqa: F401 - used via monkeypatch in tests; T20 adds direct use
    pick_latest_stable,
)
from app.cli._privilege import has_sudo_for
from app.cli._state import STATE_DIR
from app.cli._systemd import SYSTEMCTL

PROJECT_DIR = Path("/opt/waffleweather")
BACKEND_DIR = PROJECT_DIR / "backend"
FRONTEND_DIR = PROJECT_DIR / "frontend"
UV_PATH = Path("/usr/local/bin/uv")
PNPM_PATH = Path("/usr/local/bin/pnpm")
ENV_FILE = PROJECT_DIR / ".env"
BACKUP_DIR_HINT = Path("/var/backups/waffleweather")


class PreflightFail(Exception):
    """Raised when a preflight check fails. The CLI maps this to exit code 2."""


class InvalidTarget(Exception):
    """User supplied --target that doesn't match the stable CalVer pattern, or it doesn't exist."""


def installed_version() -> str | None:
    """Return the installed waffleweather-backend wheel version, or None."""
    try:
        return pkg_version("waffleweather-backend")
    except PackageNotFoundError:
        return None


def detect_current_version(cwd: Path) -> str | None:
    """Resolve the currently-installed version as a v-prefixed CalVer string.

    Precedence:
      1. git describe --tags --exact-match HEAD (returned with leading 'v')
      2. importlib.metadata wheel version (prepend 'v')
      3. None
    """
    tag = current_tag(cwd)
    if tag:
        return tag if tag.startswith("v") else f"v{tag}"
    pkg = installed_version()
    if pkg:
        return f"v{pkg}"
    return None


def _normalize_target(value: str) -> str:
    """Normalize a user-supplied target tag to have a leading 'v'."""
    return value if value.startswith("v") else f"v{value}"


def select_target(available_tags: list[str], override: str | None) -> str:
    """Pick the target tag: either the user's --target, or the latest stable."""
    stable = [t for t in available_tags if STABLE_TAG_RE.match(t)]
    if override is None:
        chosen = pick_latest_stable(stable)
        if chosen is None:
            raise InvalidTarget("No stable release tags found on origin.")
        return chosen
    if not STABLE_TAG_RE.match(override):
        raise InvalidTarget(
            f"Target '{override}' is not a stable release tag (expected v?YYYY.M.D.N)."
        )
    normalized = _normalize_target(override)
    if normalized not in stable:
        raise InvalidTarget(f"Target tag '{normalized}' not found on origin.")
    return normalized


def _err_exit(ctx: click.Context, message: str, code: int = 2) -> None:
    click.echo(message, err=True)
    ctx.exit(code)


def preflight_minimal(ctx: click.Context) -> None:
    """Local-only checks shared by --check and full update.

    Note: network reachability is verified during the Discover phase
    (Task 20) via `git ls-remote --tags origin`. Preflight here covers
    only local-filesystem invariants that can be checked instantly.

    Raises PreflightFail on any issue (the caller maps it to exit code 2).
    """
    if is_docker_environment():
        raise PreflightFail(
            "waffleweather CLI is for bare-metal installs. "
            "For Docker, use docker compose ps/logs/restart."
        )
    if not (PROJECT_DIR / ".git").exists():
        raise PreflightFail(
            f"{PROJECT_DIR} is not a git-managed repository. This install was likely set up "
            "manually (e.g., via rsync from a dev machine). The 'update' command is "
            "only supported for installs from install.sh."
        )


def _executable_by_others(path: Path) -> bool:
    """True if the file's mode bits include o+x (so the service user can run it)."""
    try:
        mode = path.stat().st_mode
    except OSError:
        return False
    return bool(mode & stat.S_IXOTH)


def preflight_full(ctx: click.Context, env_path: Path | None) -> None:
    """Full-update preflight (adds beyond minimal): uv, pnpm, .env, state dir, backup dir, sudo, project writable."""
    if not UV_PATH.exists() or not os.access(UV_PATH, os.X_OK):
        raise PreflightFail(
            f"uv not found at {UV_PATH}. "
            f"Run: sudo install -m 0755 ~/.local/bin/uv {UV_PATH}"
        )
    if not PNPM_PATH.exists() or not _executable_by_others(PNPM_PATH):
        raise PreflightFail(
            f"pnpm not found or not executable at {PNPM_PATH}. "
            "Install pnpm system-wide as root (e.g., via corepack enable && "
            "corepack prepare pnpm@latest --activate) so the service user can execute it."
        )
    if not ENV_FILE.exists() or not os.access(ENV_FILE, os.R_OK):
        raise PreflightFail(
            f"Cannot read {ENV_FILE}. "
            f"Run: sudo chgrp waffleweather-admin {ENV_FILE} && sudo chmod 640 {ENV_FILE}"
        )
    if not STATE_DIR.exists() or not os.access(STATE_DIR, os.W_OK):
        raise PreflightFail(
            f"State directory not found or not writable at {STATE_DIR}/. "
            f"Run: sudo install -d -m 2770 -o waffleweather -g waffleweather-admin {STATE_DIR}/"
        )
    if not BACKUP_DIR_HINT.exists() or not os.access(BACKUP_DIR_HINT, os.W_OK):
        raise PreflightFail(
            f"Backup directory not found or not writable at {BACKUP_DIR_HINT}/. "
            f"Run: sudo install -d -m 2770 -o waffleweather -g waffleweather-admin {BACKUP_DIR_HINT}/"
        )
    if not has_sudo_for([SYSTEMCTL, "restart", "waffleweather-backend"]):
        raise PreflightFail(
            "This command needs sudo. Run: sudo -v && retry, "
            "or ensure your user is a member of the waffleweather-admin group."
        )
    # The admin user must be able to write to the project tree (for git
    # checkout, stash, fetch). install.sh sets ownership to
    # waffleweather:waffleweather-admin mode 2775 with setgid, but if the
    # install was done before that became the standard, surface a concrete fix.
    if not os.access(PROJECT_DIR, os.W_OK):
        raise PreflightFail(
            f"{PROJECT_DIR} is not writable by the current user. "
            "git operations (checkout, fetch, stash) will fail. Run: "
            f"sudo chown -R waffleweather:waffleweather-admin {PROJECT_DIR}/ && "
            f"sudo find {PROJECT_DIR}/ -type d -exec chmod 2775 {{}} + && "
            f"sudo find {PROJECT_DIR}/ -type f -exec chmod g+w {{}} + && "
            f"sudo -u waffleweather git -C {PROJECT_DIR} config core.sharedRepository group"
        )
    if not os.access(PROJECT_DIR / ".git", os.W_OK):
        raise PreflightFail(
            f"{PROJECT_DIR}/.git is not writable by the current user. "
            f"git fetch and checkout will fail. Run: "
            f"sudo chown -R waffleweather:waffleweather-admin {PROJECT_DIR}/.git/ && "
            f"sudo find {PROJECT_DIR}/.git -type d -exec chmod 2775 {{}} + && "
            f"sudo find {PROJECT_DIR}/.git -type f -exec chmod g+w {{}} + && "
            f"sudo -u waffleweather git -C {PROJECT_DIR} config core.sharedRepository group"
        )


@click.command("update")
@click.option("--check", "check_only", is_flag=True, default=False, help="Show whether an update is available and exit.")
@click.option("--force", is_flag=True, default=False, help="Stash uncommitted changes and continue.")
@click.option("--no-restart", is_flag=True, default=False, help="Skip service restart and verification.")
@click.option("--yes", "-y", is_flag=True, default=False, help="Skip the interactive confirmation prompt.")
@click.option("--target", default=None, help="Apply a specific stable tag instead of the latest.")
@click.option("--force-resume", is_flag=True, default=False, help="Retry a previously-failed update from its last step.")
@click.pass_context
def update_cmd(
    ctx: click.Context,
    check_only: bool,
    force: bool,
    no_restart: bool,
    yes: bool,
    target: str | None,
    force_resume: bool,
) -> None:
    """Update to the latest stable tagged release."""
    try:
        preflight_minimal(ctx)
    except PreflightFail as exc:
        _err_exit(ctx, f"✗ {exc}", code=2)
        return

    # Full preflight runs only for the apply path.
    if not check_only:
        try:
            preflight_full(ctx, env_path=ctx.obj.get("config_path"))
        except PreflightFail as exc:
            _err_exit(ctx, f"✗ {exc}", code=2)
            return

    # Tasks 19-22 add discover/plan/apply/state logic here.
    click.echo("Update flow not yet wired up — see Tasks 19-22.")
    ctx.exit(0)
