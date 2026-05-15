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
    with (
        patch("app.cli.backup.load_settings", return_value=_mock_settings()),
        patch("subprocess.Popen") as mock_popen,
    ):
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
    with (
        patch("app.cli.backup.load_settings", return_value=_mock_settings()),
        patch("subprocess.Popen") as mock_popen,
    ):
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
    with (
        patch("app.cli.backup.load_settings", return_value=_mock_settings()),
        patch("subprocess.Popen") as mock_popen,
    ):
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
    with (
        patch("app.cli.backup.load_settings", return_value=_mock_settings()),
        patch("subprocess.Popen") as mock_popen,
    ):
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


def test_backup_pg_dump_failure_cleans_up_partial(tmp_path, runner, monkeypatch):
    """pg_dump exit non-zero must clean up the .partial file and exit 1."""
    monkeypatch.setattr("app.cli.backup.BACKUP_DIR", tmp_path)
    with (
        patch("app.cli.backup.load_settings", return_value=_mock_settings()),
        patch("subprocess.Popen") as mock_popen,
    ):
        mock_proc = MagicMock()
        mock_proc.stdout.read.side_effect = [b"", b""]
        mock_proc.stderr.read.return_value = b"connection refused"
        mock_proc.wait.return_value = 2
        mock_popen.return_value = mock_proc
        result = runner.invoke(cli, ["backup"])
    assert result.exit_code == 1
    # No .partial file should remain
    partials = list(tmp_path.glob("*.partial"))
    assert partials == []
    # No .sql.gz file either (write was aborted)
    finals = list(tmp_path.glob("*.sql.gz"))
    assert finals == []


def test_prune_keeps_newest_n(tmp_path, monkeypatch):
    """_prune retains the newest N matching files and deletes older."""
    from app.cli.backup import _prune

    monkeypatch.setattr("app.cli.backup.BACKUP_DIR", tmp_path)
    # Create 5 dated backups; newest filename sorts last
    for date in [
        "20260101-000000",
        "20260201-000000",
        "20260301-000000",
        "20260401-000000",
        "20260501-000000",
    ]:
        (tmp_path / f"waffleweather-{date}.sql.gz").write_text("")
    # Add a non-matching file that must NOT be deleted
    (tmp_path / "some-other-file.txt").write_text("user data")
    pruned = _prune(keep=2)
    assert len(pruned) == 3
    remaining = sorted(p.name for p in tmp_path.iterdir())
    # Only newest 2 + the unrelated file should remain
    assert remaining == [
        "some-other-file.txt",
        "waffleweather-20260401-000000.sql.gz",
        "waffleweather-20260501-000000.sql.gz",
    ]
