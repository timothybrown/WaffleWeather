"""Git wrappers used by version detection and the update flow.

All commands run with cwd at the project root (default /opt/waffleweather/).
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

GIT = "/usr/bin/git"

# Matches stable CalVer release tags. Leading 'v' is optional.
# Examples: v2026.5.14.2, 2026.5.14.2
# Rejects: v2026.5.14.2-rc1, main, abc123
STABLE_TAG_RE = re.compile(r"^v?\d{4}\.\d+\.\d+\.\d+$")


def _run(
    cmd: list[str], cwd: Path | None = None, timeout: float = 60.0
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(cmd, capture_output=True, timeout=timeout, cwd=str(cwd) if cwd else None)


def is_git_repo(cwd: Path) -> bool:
    """Return True if cwd is inside a git working tree."""
    try:
        result = _run([GIT, "rev-parse", "--is-inside-work-tree"], cwd=cwd, timeout=5)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
    return result.returncode == 0


def current_tag(cwd: Path) -> str | None:
    """Return the tag exactly pointing at HEAD, or None if HEAD isn't on a tag."""
    try:
        result = _run([GIT, "describe", "--tags", "--exact-match", "HEAD"], cwd=cwd, timeout=5)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.decode().strip() or None


def is_working_tree_clean(cwd: Path) -> bool:
    """Return True if `git status --porcelain` outputs nothing."""
    try:
        result = _run([GIT, "status", "--porcelain"], cwd=cwd, timeout=10)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
    return result.returncode == 0 and result.stdout.strip() == b""


def list_remote_tags(cwd: Path, timeout: float = 60.0) -> list[str]:
    """`git ls-remote --tags origin` — side-effect-free. Returns tag names (no refs/tags/ prefix)."""
    result = _run([GIT, "ls-remote", "--tags", "origin"], cwd=cwd, timeout=timeout)
    if result.returncode != 0:
        return []
    tags: list[str] = []
    for line in result.stdout.decode().splitlines():
        # Format: "<sha>\trefs/tags/<tag>"
        _, _, ref = line.partition("\t")
        if ref.startswith("refs/tags/"):
            tag = ref.removeprefix("refs/tags/")
            # Skip dereferenced tag entries (annotated tag peel refs end in ^{})
            if not tag.endswith("^{}"):
                tags.append(tag)
    return tags


def fetch_tags(cwd: Path, timeout: float = 60.0) -> None:
    """`git fetch --tags --prune origin` — mutates local refs."""
    result = _run([GIT, "fetch", "--tags", "--prune", "origin"], cwd=cwd, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"git fetch failed: {result.stderr.decode(errors='replace').strip()}")


def filter_stable_tags(tags: list[str]) -> list[str]:
    """Keep only tags matching the stable CalVer pattern."""
    return [t for t in tags if STABLE_TAG_RE.match(t)]


def _tag_to_tuple(tag: str) -> tuple[int, ...]:
    bare = tag.removeprefix("v")
    return tuple(int(p) for p in bare.split("."))


def tag_compare(a: str, b: str) -> int:
    """Return -1/0/1 like cmp(). Compares CalVer tags numerically."""
    ta, tb = _tag_to_tuple(a), _tag_to_tuple(b)
    if ta < tb:
        return -1
    if ta > tb:
        return 1
    return 0


def pick_latest_stable(tags: list[str]) -> str | None:
    """Return the highest-versioned stable tag, or None if no stable tags present."""
    stable = filter_stable_tags(tags)
    if not stable:
        return None
    return max(stable, key=_tag_to_tuple)


def commit_log(cwd: Path, from_ref: str, to_ref: str) -> list[str]:
    """`git log <from>..<to> --oneline` as a list of lines. Requires objects present locally."""
    result = _run([GIT, "log", f"{from_ref}..{to_ref}", "--oneline"], cwd=cwd, timeout=10)
    if result.returncode != 0:
        return []
    return result.stdout.decode(errors="replace").splitlines()


def checkout(cwd: Path, ref: str, timeout: float = 30.0) -> None:
    """`git checkout <ref>` — detached HEAD when ref is a tag."""
    result = _run([GIT, "checkout", ref], cwd=cwd, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(
            f"git checkout {ref} failed: {result.stderr.decode(errors='replace').strip()}"
        )


def stash_push(cwd: Path, message: str, timeout: float = 30.0) -> str:
    """Stash everything (tracked + untracked) and return the stash ref printed by git."""
    result = _run(
        [GIT, "stash", "push", "--include-untracked", "--message", message],
        cwd=cwd,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git stash failed: {result.stderr.decode(errors='replace').strip()}")
    # Output line shape: "Saved working directory and index state On <branch>: <message>"
    # The actual stash ref is stash@{0} immediately after a successful push.
    return "stash@{0}"


def remote_origin_url(cwd: Path) -> str | None:
    """Return the URL of the `origin` remote, or None if not set."""
    try:
        result = _run([GIT, "remote", "get-url", "origin"], cwd=cwd, timeout=5)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.decode().strip() or None


_GH_HTTPS_RE = re.compile(r"^https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$")
_GH_SSH_RE = re.compile(r"^git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$")


def parse_github_url(url: str) -> tuple[str, str] | None:
    """Return (owner, repo) for a GitHub URL, or None if it's not a recognizable GitHub URL."""
    m = _GH_HTTPS_RE.match(url) or _GH_SSH_RE.match(url)
    if not m:
        return None
    return m.group(1), m.group(2)
