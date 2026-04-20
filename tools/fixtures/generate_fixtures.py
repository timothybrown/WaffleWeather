"""Generate golden value fixtures for E2E tests."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click
import httpx

REPO_ROOT = Path(__file__).parent.parent.parent
ENDPOINTS_PATH = REPO_ROOT / "tests" / "e2e"

sys.path.insert(0, str(ENDPOINTS_PATH))
from endpoints import GOLDEN_ENDPOINTS, fixture_filename  # noqa: E402


@click.group()
def cli() -> None:
    """WaffleWeather E2E fixture generator."""


@cli.command()
@click.option(
    "--url",
    required=True,
    help="Backend URL (e.g. http://localhost:18000)",
)
@click.option(
    "--fixtures-dir",
    type=click.Path(),
    default=None,
    help="Output directory (default: tests/e2e/fixtures/)",
)
def generate(url: str, fixtures_dir: str | None) -> None:
    """Generate golden value fixture files from a running backend."""
    out_dir = Path(fixtures_dir) if fixtures_dir else REPO_ROOT / "tests" / "e2e" / "fixtures"
    out_dir.mkdir(parents=True, exist_ok=True)

    with httpx.Client(base_url=url, timeout=30) as client:
        try:
            resp = client.get("/api/v1/version")
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise click.ClickException(f"Cannot reach backend at {url}: {exc}")

        generated = 0
        for endpoint in GOLDEN_ENDPOINTS:
            fname = fixture_filename(endpoint)
            click.echo(f"  {endpoint.path} → {fname}")

            resp = client.get(endpoint.path, params=endpoint.params)
            if resp.status_code != 200:
                click.echo(f"    WARNING: {resp.status_code} — skipping", err=True)
                continue

            try:
                data = resp.json()
            except ValueError:
                click.echo(f"    WARNING: non-JSON response — skipping", err=True)
                continue

            fixture_path = out_dir / fname
            with open(fixture_path, "w") as f:
                json.dump(data, f, indent=2, sort_keys=True)
                f.write("\n")
            generated += 1

        click.echo(f"\nGenerated {generated} fixtures in {out_dir}")
