"""`waffleweather backup` — pg_dump with retention."""

from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import click
from sqlalchemy.engine.url import make_url

from app.cli._settings import load_settings

BACKUP_DIR = Path("/var/backups/waffleweather")
FILENAME_RE = re.compile(r"^waffleweather-\d{8}-\d{6}\.sql\.gz$")


def _build_pg_env(database_url: str) -> dict[str, str]:
    """Parse the SQLAlchemy URL and return libpq env vars."""
    url = make_url(database_url)
    env = os.environ.copy()
    env["PGHOST"] = url.host or ""
    env["PGPORT"] = str(url.port or 5432)
    env["PGUSER"] = url.username or ""
    env["PGPASSWORD"] = url.password or ""
    env["PGDATABASE"] = url.database or ""
    return env


def _list_existing_backups() -> list[Path]:
    if not BACKUP_DIR.exists():
        return []
    files = [p for p in BACKUP_DIR.iterdir() if FILENAME_RE.match(p.name)]
    files.sort(reverse=True)  # newest first by filename
    return files


def _prune(keep: int) -> list[Path]:
    """Delete backups beyond the `keep` newest. Return list of deleted paths."""
    existing = _list_existing_backups()
    to_delete = existing[keep:]
    for p in to_delete:
        try:
            p.unlink()
        except OSError:
            pass
    return to_delete


def do_backup(database_url: str, keep: int) -> tuple[Path, int, list[Path]]:
    """Run pg_dump | gzip, write to BACKUP_DIR, prune. Return (path, size_bytes, pruned)."""
    if not BACKUP_DIR.exists() or not os.access(BACKUP_DIR, os.W_OK):
        raise FileNotFoundError(
            f"Backup directory not found or not writable at {BACKUP_DIR}/. "
            f"Run: sudo install -d -m 2770 -o waffleweather -g waffleweather-admin {BACKUP_DIR}/"
        )

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = BACKUP_DIR / f"waffleweather-{timestamp}.sql.gz"
    tmp_path = out_path.with_suffix(".sql.gz.partial")

    env = _build_pg_env(database_url)
    pg_dump = shutil.which("pg_dump") or "/usr/bin/pg_dump"

    # IMPORTANT: cannot pass GzipFile as subprocess.stdout — subprocess writes
    # to the file's underlying fd via .fileno(), bypassing Python's gzip layer
    # and producing uncompressed bytes in a .gz file. Instead, capture pg_dump
    # output via Popen + PIPE and stream it into a gzip.open() writer.
    try:
        proc = subprocess.Popen(
            [pg_dump, "--no-owner", "--no-acl"],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        with gzip.open(tmp_path, "wb") as gz_fh:
            assert proc.stdout is not None  # for mypy
            while chunk := proc.stdout.read(65536):
                gz_fh.write(chunk)
        proc.stdout.close()
        try:
            return_code = proc.wait(timeout=3600)  # 1 hour ceiling
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)  # reap the process; tmp cleanup happens in outer except
            raise RuntimeError("pg_dump exceeded 1 hour timeout — backup aborted") from None
        if return_code != 0:
            assert proc.stderr is not None
            stderr = proc.stderr.read().decode(errors="replace").strip()
            tmp_path.unlink(missing_ok=True)
            raise RuntimeError(f"pg_dump failed (exit {return_code}): {stderr}")
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    tmp_path.rename(out_path)
    size = out_path.stat().st_size
    pruned = _prune(keep)
    return out_path, size, pruned


@click.command("backup")
@click.option("--keep", default=7, show_default=True, help="Number of backups to retain.")
@click.pass_context
def backup_cmd(ctx: click.Context, keep: int) -> None:
    """Take a gzipped pg_dump backup and prune old files."""
    json_output = ctx.obj.get("json", False)
    config_path = ctx.obj.get("config_path")

    try:
        settings = load_settings(env_path=config_path)
    except Exception as exc:
        click.echo(f"✗ Could not load settings: {exc}", err=True)
        ctx.exit(2)
        return

    try:
        path, size, pruned = do_backup(settings.database_url, keep=keep)
    except FileNotFoundError as exc:
        if json_output:
            sys.stdout.write(json.dumps({"error": str(exc)}) + "\n")
        else:
            click.echo(f"✗ {exc}", err=True)
        ctx.exit(1)
        return
    except Exception as exc:
        if json_output:
            sys.stdout.write(json.dumps({"error": str(exc)}) + "\n")
        else:
            click.echo(f"✗ Backup failed: {exc}", err=True)
        ctx.exit(1)
        return

    if json_output:
        sys.stdout.write(
            json.dumps(
                {
                    "path": str(path),
                    "size_bytes": size,
                    "pruned": [str(p) for p in pruned],
                }
            )
            + "\n"
        )
        return

    click.echo(f"✓ Backup written: {path} ({size:,} bytes)")
    if pruned:
        click.echo(f"  Pruned {len(pruned)} older backup(s).")
