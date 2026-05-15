"""Tests for the `backup` command."""

import json
from unittest.mock import MagicMock, patch

from app.cli.__main__ import cli


def _mock_settings():
    s = MagicMock()
    s.database_url = "postgresql+asyncpg://u:p@h:5432/d"
    return s


def test_backup_missing_dir_exits_1(runner, tmp_path, monkeypatch):
    missing = tmp_path / "no-such-dir"
    monkeypatch.setattr("app.cli.backup.BACKUP_DIR", missing)
    with patch("app.cli.backup.load_settings", return_value=_mock_settings()):
        result = runner.invoke(cli, ["backup"])
    assert result.exit_code == 1
    assert "sudo install -d" in result.stdout or "sudo install -d" in result.stderr


def test_backup_success(tmp_path, runner, monkeypatch):
    monkeypatch.setattr("app.cli.backup.BACKUP_DIR", tmp_path)
    with patch("app.cli.backup.load_settings", return_value=_mock_settings()), \
         patch("subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        mock_proc.stdout.read.side_effect = [b"SELECT 1;\n", b""]
        mock_proc.stderr.read.return_value = b""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc
        result = runner.invoke(cli, ["backup", "--keep", "2"])
    assert result.exit_code == 0
    pg_calls = [c for c in mock_popen.call_args_list if c.args[0][0].endswith("pg_dump")]
    assert pg_calls


def test_backup_url_parsed_into_pg_env(tmp_path, runner, monkeypatch):
    monkeypatch.setattr("app.cli.backup.BACKUP_DIR", tmp_path)
    with patch("app.cli.backup.load_settings", return_value=_mock_settings()), \
         patch("subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        mock_proc.stdout.read.side_effect = [b"", b""]
        mock_proc.stderr.read.return_value = b""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc
        runner.invoke(cli, ["backup"])
    pg_call = next(c for c in mock_popen.call_args_list if c.args[0][0].endswith("pg_dump"))
    env = pg_call.kwargs.get("env") or {}
    assert env.get("PGUSER") == "u"
    assert env.get("PGPASSWORD") == "p"
    assert env.get("PGHOST") == "h"
    assert env.get("PGPORT") == "5432"
    assert env.get("PGDATABASE") == "d"


def test_backup_json_output(tmp_path, runner, monkeypatch):
    monkeypatch.setattr("app.cli.backup.BACKUP_DIR", tmp_path)
    with patch("app.cli.backup.load_settings", return_value=_mock_settings()), \
         patch("subprocess.Popen") as mock_popen:
        # Simulate pg_dump producing minimal SQL output
        mock_proc = MagicMock()
        mock_proc.stdout.read.side_effect = [b"SELECT 1;\n", b""]
        mock_proc.stderr.read.return_value = b""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc
        result = runner.invoke(cli, ["--json", "backup"])
    parsed = json.loads(result.stdout)
    assert "path" in parsed
    assert "size_bytes" in parsed


def test_backup_produces_valid_gzip(tmp_path, runner, monkeypatch):
    """Regression test: the output file must actually be gzip-compressed."""
    import gzip
    monkeypatch.setattr("app.cli.backup.BACKUP_DIR", tmp_path)
    with patch("app.cli.backup.load_settings", return_value=_mock_settings()), \
         patch("subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        sql_dump = b"-- waffleweather dump\nSELECT 1;\n"
        mock_proc.stdout.read.side_effect = [sql_dump, b""]
        mock_proc.stderr.read.return_value = b""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc
        result = runner.invoke(cli, ["backup"])
    assert result.exit_code == 0
    # Find the generated file and confirm it round-trips through gzip
    produced = next(p for p in tmp_path.iterdir() if p.suffix == ".gz")
    with gzip.open(produced, "rb") as fh:
        decompressed = fh.read()
    assert decompressed == sql_dump
