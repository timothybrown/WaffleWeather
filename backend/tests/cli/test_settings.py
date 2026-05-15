"""Tests for the CLI Settings loader."""

from pathlib import Path

from app.cli._settings import DEFAULT_PROD_ENV, load_settings


def test_explicit_env_path_wins(tmp_path, monkeypatch):
    env_file = tmp_path / "custom.env"
    env_file.write_text("WW_DATABASE_URL=postgresql+asyncpg://u:p@h:5432/d\n")
    # Make sure no environment override interferes
    monkeypatch.delenv("WW_CLI_ENV", raising=False)
    monkeypatch.delenv("WW_DATABASE_URL", raising=False)
    settings = load_settings(env_path=env_file)
    assert settings.database_url == "postgresql+asyncpg://u:p@h:5432/d"


def test_env_var_override(tmp_path, monkeypatch):
    env_file = tmp_path / "custom.env"
    env_file.write_text("WW_DATABASE_URL=postgresql+asyncpg://a:b@c:5432/d\n")
    monkeypatch.setenv("WW_CLI_ENV", str(env_file))
    monkeypatch.delenv("WW_DATABASE_URL", raising=False)
    # Force the prod-default branch off so we test the branch the test name claims
    monkeypatch.setattr("app.cli._settings.DEFAULT_PROD_ENV", tmp_path / "nonexistent")
    settings = load_settings(env_path=None)
    assert settings.database_url == "postgresql+asyncpg://a:b@c:5432/d"


def test_default_prod_path_constant():
    assert DEFAULT_PROD_ENV == Path("/opt/waffleweather/.env")


def test_dev_fallback(tmp_path, monkeypatch):
    # When no explicit path, no env override, and no prod file, fall back to pydantic-settings default.
    monkeypatch.delenv("WW_CLI_ENV", raising=False)
    monkeypatch.setenv("WW_DATABASE_URL", "postgresql+asyncpg://fallback:fallback@h:5432/d")
    # Force the prod-default branch off so we test the branch the test name claims
    monkeypatch.setattr("app.cli._settings.DEFAULT_PROD_ENV", tmp_path / "nonexistent")
    settings = load_settings(env_path=None)
    assert "fallback" in settings.database_url
