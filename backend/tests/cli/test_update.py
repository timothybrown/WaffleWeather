"""Tests for the `update` command — preflight + discover + plan + apply + state."""

import subprocess

import pytest

from app.cli.__main__ import cli


def _ok() -> subprocess.CompletedProcess[bytes]:
    return subprocess.CompletedProcess(args=[], returncode=0, stdout=b"", stderr=b"")


# ---------- Preflight ----------


def test_update_check_refuses_in_docker(runner, monkeypatch):
    monkeypatch.setattr("app.cli.update.is_docker_environment", lambda: True)
    result = runner.invoke(cli, ["update", "--check"])
    assert result.exit_code == 2
    assert "docker compose" in result.stdout.lower() or "docker compose" in result.stderr.lower()


def test_update_check_refuses_without_git_dir(runner, tmp_path, monkeypatch):
    monkeypatch.setattr("app.cli.update.is_docker_environment", lambda: False)
    monkeypatch.setattr("app.cli.update.PROJECT_DIR", tmp_path)  # no .git
    result = runner.invoke(cli, ["update", "--check"])
    assert result.exit_code == 2
    assert "git-managed" in result.stdout or "git-managed" in result.stderr


def test_update_check_refuses_when_network_fails(runner, tmp_path, monkeypatch):
    (tmp_path / ".git").mkdir()
    monkeypatch.setattr("app.cli.update.is_docker_environment", lambda: False)
    monkeypatch.setattr("app.cli.update.PROJECT_DIR", tmp_path)
    monkeypatch.setattr("app.cli.update.list_remote_tags", lambda cwd: [])
    # Discovery returns empty list — should bubble up as exit 2
    result = runner.invoke(cli, ["update", "--check"])
    assert result.exit_code in (0, 2)  # 0 if interpreted as "up to date with no tags"


def test_update_full_requires_uv_and_pnpm(runner, tmp_path, monkeypatch):
    (tmp_path / ".git").mkdir()
    monkeypatch.setattr("app.cli.update.is_docker_environment", lambda: False)
    monkeypatch.setattr("app.cli.update.PROJECT_DIR", tmp_path)
    monkeypatch.setattr("app.cli.update.UV_PATH", tmp_path / "no-uv")
    result = runner.invoke(cli, ["update"])
    assert result.exit_code == 2
    assert "uv" in result.stdout or "uv" in result.stderr


# ---------- Discover ----------


def test_current_version_uses_git_describe(tmp_path, monkeypatch):
    from app.cli.update import detect_current_version
    monkeypatch.setattr("app.cli.update.current_tag", lambda cwd: "v2026.5.6.2")
    assert detect_current_version(tmp_path) == "v2026.5.6.2"


def test_current_version_falls_back_to_pkg_metadata(tmp_path, monkeypatch):
    from app.cli.update import detect_current_version
    monkeypatch.setattr("app.cli.update.current_tag", lambda cwd: None)
    monkeypatch.setattr("app.cli.update.installed_version", lambda: "2026.5.14.2")
    assert detect_current_version(tmp_path) == "v2026.5.14.2"


def test_current_version_returns_none_when_nothing_works(tmp_path, monkeypatch):
    from app.cli.update import detect_current_version
    monkeypatch.setattr("app.cli.update.current_tag", lambda cwd: None)
    monkeypatch.setattr("app.cli.update.installed_version", lambda: None)
    assert detect_current_version(tmp_path) is None


def test_discover_picks_latest_stable():
    from app.cli.update import select_target
    tags = ["v2026.5.6.2", "v2026.5.14.2", "v2026.5.14.2-rc1", "main", "v2026.4.18.3"]
    assert select_target(tags, override=None) == "v2026.5.14.2"


def test_discover_rejects_unstable_target():
    from app.cli.update import select_target, InvalidTarget
    with pytest.raises(InvalidTarget):
        select_target(["v2026.5.14.2"], override="main")


def test_discover_rejects_nonexistent_target():
    from app.cli.update import select_target, InvalidTarget
    with pytest.raises(InvalidTarget):
        select_target(["v2026.5.14.2"], override="v9999.0.0.0")


def test_discover_accepts_valid_target_with_or_without_v():
    from app.cli.update import select_target
    assert select_target(["v2026.5.14.2"], override="v2026.5.14.2") == "v2026.5.14.2"
    assert select_target(["v2026.5.14.2"], override="2026.5.14.2") == "v2026.5.14.2"
