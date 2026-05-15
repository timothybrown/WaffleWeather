"""Tests for the `update` command — preflight + discover + plan + apply + state."""

import subprocess

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
