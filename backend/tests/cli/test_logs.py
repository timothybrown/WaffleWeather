"""Tests for the `logs` command."""

from unittest.mock import patch

from app.cli.__main__ import cli


def test_logs_default_unit_is_backend(runner):
    with patch("app.cli.logs.os.execvp") as exec_mock:
        runner.invoke(cli, ["logs", "--no-follow"])
    args, argv = exec_mock.call_args[0]
    assert args == "/usr/bin/journalctl"
    assert "-u" in argv
    assert argv[argv.index("-u") + 1] == "waffleweather-backend"


def test_logs_resolves_alias_frontend(runner):
    with patch("app.cli.logs.os.execvp") as exec_mock:
        runner.invoke(cli, ["logs", "frontend", "--no-follow"])
    _, argv = exec_mock.call_args[0]
    assert argv[argv.index("-u") + 1] == "waffleweather-frontend"


def test_logs_resolves_alias_mqtt(runner):
    with patch("app.cli.logs.os.execvp") as exec_mock:
        runner.invoke(cli, ["logs", "mqtt", "--no-follow"])
    _, argv = exec_mock.call_args[0]
    assert argv[argv.index("-u") + 1] == "mosquitto"


def test_logs_passes_lines_and_since(runner):
    with patch("app.cli.logs.os.execvp") as exec_mock:
        runner.invoke(cli, ["logs", "--lines", "50", "--since", "30m", "--no-follow"])
    _, argv = exec_mock.call_args[0]
    assert "-n" in argv and argv[argv.index("-n") + 1] == "50"
    assert "--since" in argv and argv[argv.index("--since") + 1] == "30m"


def test_logs_follow_when_tty(runner):
    with (
        patch("app.cli.logs.os.execvp") as exec_mock,
        patch("app.cli.logs._stdout_is_tty", return_value=True),
    ):
        runner.invoke(cli, ["logs"])
    _, argv = exec_mock.call_args[0]
    assert "-f" in argv


def test_logs_no_follow_when_piped(runner):
    with (
        patch("app.cli.logs.os.execvp") as exec_mock,
        patch("app.cli.logs._stdout_is_tty", return_value=False),
    ):
        runner.invoke(cli, ["logs"])
    _, argv = exec_mock.call_args[0]
    assert "-f" not in argv


def test_json_logs_rejected_before_execvp(runner):
    """--json must exit 2 BEFORE we exec into journalctl — no side effects."""
    with patch("app.cli.logs.os.execvp") as exec_mock:
        result = runner.invoke(cli, ["--json", "logs"])
    assert result.exit_code == 2
    exec_mock.assert_not_called()
