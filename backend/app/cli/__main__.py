"""WaffleWeather CLI entry point."""

from __future__ import annotations

from pathlib import Path

import click
from rich.console import Console

# Commands that support --json output. The CLI group validates --json against
# this set BEFORE invoking the subcommand so unsupported combos exit cleanly
# without side effects.
JSON_SUPPORTED_COMMANDS: frozenset[str] = frozenset({"status", "doctor", "version", "backup"})


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.option(
    "--json",
    "json_output",
    is_flag=True,
    default=False,
    help="Emit machine-readable JSON where supported.",
)
@click.option(
    "--debug", is_flag=True, default=False, help="Re-raise tracebacks; verbose subprocess output."
)
@click.option("--no-color", is_flag=True, default=False, help="Disable Rich coloring.")
@click.option(
    "--config-path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="Override .env file location.",
)
@click.version_option(package_name="waffleweather-backend", prog_name="waffleweather")
@click.pass_context
def cli(
    ctx: click.Context,
    json_output: bool,
    debug: bool,
    no_color: bool,
    config_path: Path | None,
) -> None:
    """WaffleWeather operations CLI.

    Run 'waffleweather <command> --help' for command-specific options.
    """
    ctx.ensure_object(dict)
    ctx.obj["json"] = json_output
    ctx.obj["debug"] = debug
    ctx.obj["config_path"] = config_path
    ctx.obj["console"] = Console(no_color=no_color, stderr=False)
    ctx.obj["err_console"] = Console(no_color=no_color, stderr=True)

    # Validate --json compatibility BEFORE the subcommand runs (no side effects yet).
    if (
        json_output
        and ctx.invoked_subcommand
        and ctx.invoked_subcommand not in JSON_SUPPORTED_COMMANDS
    ):
        click.echo(
            f"Error: --json is not supported by '{ctx.invoked_subcommand}'. "
            f"Supported: {', '.join(sorted(JSON_SUPPORTED_COMMANDS))}.",
            err=True,
        )
        ctx.exit(2)


from app.cli.version import version_cmd  # noqa: E402

cli.add_command(version_cmd)

from app.cli.logs import logs_cmd  # noqa: E402

cli.add_command(logs_cmd)

from app.cli.restart import restart_cmd  # noqa: E402

cli.add_command(restart_cmd)

from app.cli.status import status_cmd  # noqa: E402

cli.add_command(status_cmd)

from app.cli.doctor import doctor_cmd  # noqa: E402

cli.add_command(doctor_cmd)

from app.cli.backup import backup_cmd  # noqa: E402

cli.add_command(backup_cmd)

from app.cli.update import update_cmd  # noqa: E402

cli.add_command(update_cmd)
