"""`waffleweather update` — tagged-release update with state machine.

Spec: docs/superpowers/specs/2026-05-14-waffleweather-cli-design.md
"""

from __future__ import annotations

import json
import os
import stat
import subprocess
import time
import tomllib
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version as pkg_version
from pathlib import Path
from typing import Any

import click

from app.cli._checks import backend_http_version
from app.cli._docker import is_docker_environment
from app.cli._git import (
    STABLE_TAG_RE,
    checkout as git_checkout,
    commit_log,
    current_tag,
    fetch_tags,
    is_working_tree_clean,  # noqa: F401 - patched in tests; T23 adds direct use
    list_remote_tags,
    parse_github_url,
    pick_latest_stable,
    remote_origin_url,
    tag_compare,
)
from app.cli._privilege import has_sudo_for
from app.cli._settings import load_settings
from app.cli._state import (
    STATE_DIR,
    Phase,
    UpdateState,
    delete_state,
    read_state,  # noqa: F401 - patched in tests; T22 adds direct use
    write_state,
)
from app.cli._systemd import DEFAULT_RESTART_UNITS, SYSTEMCTL, is_active
from app.cli.backup import do_backup

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


def _release_notes_url(cwd: Path, target_tag: str) -> str | None:
    url = remote_origin_url(cwd)
    if url is None:
        return None
    parsed = parse_github_url(url)
    if parsed is None:
        return None
    owner, repo = parsed
    return f"https://github.com/{owner}/{repo}/releases/tag/{target_tag}"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def verify_tag_versions_match(cwd: Path, target_tag: str) -> None:
    """Confirm backend/pyproject.toml and frontend/package.json both have the target version.

    Raises RuntimeError on mismatch — the safety net for hand-tagged releases.
    """
    target_version = target_tag.removeprefix("v")
    backend_toml = cwd / "backend" / "pyproject.toml"
    frontend_pkg = cwd / "frontend" / "package.json"

    with open(backend_toml, "rb") as fh:
        backend_data = tomllib.load(fh)
    backend_version = backend_data["project"]["version"]
    if backend_version != target_version:
        raise RuntimeError(
            f"backend/pyproject.toml has version {backend_version!r}, expected {target_version!r}"
        )

    frontend_data = json.loads(frontend_pkg.read_text())
    frontend_version = frontend_data["version"]
    if frontend_version != target_version:
        raise RuntimeError(
            f"frontend/package.json has version {frontend_version!r}, expected {target_version!r}"
        )


def _run_step(cmd: list[str], cwd: Path) -> None:
    """Run a subprocess with live output to the terminal. Raises on non-zero exit.

    Deliberately does NOT capture stdout/stderr — long-running steps (uv sync,
    pnpm build, alembic) should show progress in real time rather than buffer
    silently for minutes. The user sees the failure as it happens; the state
    file's `failed_step` is the audit trail.
    """
    proc = subprocess.run(cmd, cwd=str(cwd))
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed (exit {proc.returncode}). See output above.")


def poll_running_version(target_tag: str, api_key: str | None, timeout: float = 30.0) -> bool:
    """Poll /api/v1/version for up to `timeout` seconds; return True when it matches target."""
    target_version = target_tag.removeprefix("v")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        running = backend_http_version(api_key=api_key)
        if running == target_version:
            return True
        time.sleep(2)
    return False


def run_apply(
    *,
    ctx: click.Context,
    previous: str,
    target: str,
    no_restart: bool,
    settings: Any,
) -> None:
    """Execute the apply pipeline: checkout, deps, migrate, build, restart, verify.

    Writes state at each phase boundary. Raises RuntimeError on failure — the
    caller maps that to exit code 1 with failure-state recording (Task 22).
    """
    state = UpdateState(
        phase=Phase.STARTING,
        previous_tag=previous,
        previous_version=previous.removeprefix("v"),
        target_tag=target,
        started_at=_utc_now_iso(),
        updated_at=_utc_now_iso(),
    )
    write_state(state)

    # Backup
    backup_path, _, _ = do_backup(settings.database_url, keep=7)
    state.backup_path = str(backup_path)
    state.updated_at = _utc_now_iso()
    write_state(state)

    # Phase: checkout
    state.phase = Phase.CHECKOUT
    state.updated_at = _utc_now_iso()
    write_state(state)
    git_checkout(PROJECT_DIR, target)
    verify_tag_versions_match(PROJECT_DIR, target)

    # Phase: deps (backend)
    state.phase = Phase.DEPS
    state.updated_at = _utc_now_iso()
    write_state(state)
    _run_step(["sudo", "-u", "waffleweather", str(UV_PATH), "sync", "--frozen"], cwd=BACKEND_DIR)

    # Phase: migrate
    state.phase = Phase.MIGRATE
    state.updated_at = _utc_now_iso()
    write_state(state)
    alembic = BACKEND_DIR / ".venv" / "bin" / "alembic"
    _run_step(["sudo", "-u", "waffleweather", str(alembic), "upgrade", "head"], cwd=BACKEND_DIR)

    # Phase: build (frontend)
    state.phase = Phase.BUILD
    state.updated_at = _utc_now_iso()
    write_state(state)
    _run_step(
        ["sudo", "-u", "waffleweather", str(PNPM_PATH), "install", "--frozen-lockfile"],
        cwd=FRONTEND_DIR,
    )
    _run_step(["sudo", "-u", "waffleweather", str(PNPM_PATH), "build"], cwd=FRONTEND_DIR)

    if no_restart:
        state.phase = Phase.COMPLETE
        state.restart_skipped = True
        state.updated_at = _utc_now_iso()
        write_state(state)
        click.echo(
            f"✓ Installed {target}. Services were NOT restarted (--no-restart). "
            "Verification skipped. Run 'sudo waffleweather restart' when ready."
        )
        return

    # Phase: restart
    state.phase = Phase.RESTART
    state.updated_at = _utc_now_iso()
    write_state(state)
    for unit in DEFAULT_RESTART_UNITS:
        _run_step(["sudo", SYSTEMCTL, "restart", unit], cwd=PROJECT_DIR)

    # Phase: verify
    state.phase = Phase.VERIFY
    state.updated_at = _utc_now_iso()
    write_state(state)
    for unit in DEFAULT_RESTART_UNITS:
        if not is_active(unit):
            raise RuntimeError(f"unit {unit} did not become active after restart")
    if not poll_running_version(target, settings.api_key, timeout=30.0):
        raise RuntimeError(f"/api/v1/version did not report {target} within 30s of restart")

    state.phase = Phase.COMPLETE
    state.updated_at = _utc_now_iso()
    write_state(state)
    click.echo(f"✓ Update complete: now running {target}.")


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

    # Discover (network-dependent — runs for both --check and full update)
    try:
        if check_only:
            tags = list_remote_tags(PROJECT_DIR)
        else:
            fetch_tags(PROJECT_DIR)
            tags = list_remote_tags(PROJECT_DIR)
    except Exception as exc:
        _err_exit(ctx, f"✗ Could not reach origin: {exc}", code=2)
        return

    current = detect_current_version(PROJECT_DIR)
    if current is None:
        _err_exit(ctx, "✗ Could not determine current installed version.", code=2)
        return

    try:
        target = select_target(tags, override=target)
    except InvalidTarget as exc:
        _err_exit(ctx, f"✗ {exc}", code=2)
        return

    # Up to date?
    if tag_compare(current, target) >= 0:
        click.echo(f"Up to date ({current}).")
        ctx.exit(0)
        return

    notes_url = _release_notes_url(PROJECT_DIR, target)

    if check_only:
        click.echo(f"Update available: {current} → {target}")
        if notes_url:
            click.echo(f"Release notes: {notes_url}")
        click.echo("Run 'waffleweather update' to apply.")
        ctx.exit(10)
        return

    # Full update: print commit log, then confirm
    log_lines = commit_log(PROJECT_DIR, current, target)
    click.echo(f"Updating from {current} → {target} ({len(log_lines)} commits)")
    for line in log_lines:
        click.echo(f"  {line}")
    if notes_url:
        click.echo(f"Release notes: {notes_url}")

    # Frontend rebuild hint will be added in Task 21.

    if not yes:
        if not click.confirm("Continue?", default=False):
            click.echo("Update cancelled.")
            ctx.exit(0)
            return

    settings = load_settings(env_path=ctx.obj.get("config_path"))
    try:
        run_apply(
            ctx=ctx,
            previous=current,
            target=target,
            no_restart=no_restart,
            settings=settings,
        )
    except RuntimeError as exc:
        # Task 22 will replace this with full failure-state recording.
        click.echo(f"✗ Update failed: {exc}", err=True)
        ctx.exit(1)
        return
    delete_state()  # success — clean up state file
    ctx.exit(0)
