"""Tests for the CLI entry point and global flags."""

from app.cli.__main__ import cli


def test_help_runs(runner):
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "waffleweather" in result.stdout.lower()


def test_no_args_shows_help(runner):
    result = runner.invoke(cli, [])
    # Click default: no args prints help to stdout or stderr and exits 0/2.
    # We don't have subcommands yet (so no "Commands:" section), but the
    # "Usage:" line is always present when help is rendered.
    combined = (result.stdout or "") + (result.stderr or "")
    assert "Usage:" in combined


def test_debug_flag_accepted(runner):
    result = runner.invoke(cli, ["--debug", "--help"])
    assert result.exit_code == 0


def test_no_color_flag_accepted(runner):
    result = runner.invoke(cli, ["--no-color", "--help"])
    assert result.exit_code == 0


def test_json_rejected_on_unsupported_command():
    # The actual exit-code check is exercised once commands are registered;
    # we'll add a runtime test in Task 13 (logs) when --json logs would
    # otherwise execvp. For now, lock in the membership invariants.
    from app.cli.__main__ import JSON_SUPPORTED_COMMANDS
    assert "logs" not in JSON_SUPPORTED_COMMANDS
    assert "restart" not in JSON_SUPPORTED_COMMANDS
    assert "update" not in JSON_SUPPORTED_COMMANDS


def test_json_accepted_on_supported_commands():
    from app.cli.__main__ import JSON_SUPPORTED_COMMANDS
    assert "status" in JSON_SUPPORTED_COMMANDS
    assert "doctor" in JSON_SUPPORTED_COMMANDS
    assert "version" in JSON_SUPPORTED_COMMANDS
    assert "backup" in JSON_SUPPORTED_COMMANDS
