"""Golden value tests — compare API responses against known-good fixtures."""

from __future__ import annotations

from pathlib import Path

import pytest

from conftest import load_fixture
from endpoints import GOLDEN_ENDPOINTS, Endpoint, fixture_filename


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _deep_compare(actual: object, expected: object, path: str = "") -> list[str]:
    """Compare two values, returning a list of mismatches.

    Uses partial matching: only checks keys present in the expected fixture.
    New keys in actual are ignored (so adding fields doesn't break tests).
    """
    errors: list[str] = []

    if isinstance(expected, dict) and isinstance(actual, dict):
        for key in expected:
            if key not in actual:
                errors.append(f"{path}.{key}: missing from response")
            else:
                errors.extend(_deep_compare(actual[key], expected[key], f"{path}.{key}"))
    elif isinstance(expected, list) and isinstance(actual, list):
        if len(actual) != len(expected):
            errors.append(f"{path}: length {len(actual)} != expected {len(expected)}")
        else:
            for i, (a, e) in enumerate(zip(actual, expected)):
                errors.extend(_deep_compare(a, e, f"{path}[{i}]"))
    elif isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        if abs(float(actual) - expected) > 0.01:
            errors.append(f"{path}: {actual} != {expected} (±0.01)")
    elif actual != expected:
        errors.append(f"{path}: {actual!r} != {expected!r}")

    return errors


def _has_fixture(endpoint: Endpoint) -> bool:
    return (FIXTURES_DIR / fixture_filename(endpoint)).exists()


@pytest.mark.parametrize(
    "endpoint",
    GOLDEN_ENDPOINTS,
    ids=[fixture_filename(ep) for ep in GOLDEN_ENDPOINTS],
)
def test_golden_value(client, endpoint: Endpoint) -> None:
    fname = fixture_filename(endpoint)
    if not _has_fixture(endpoint):
        pytest.skip(f"Fixture {fname} not found — run generate-fixtures to create")

    resp = client.get(endpoint.path, params=endpoint.params)
    assert resp.status_code == 200, f"{endpoint.path} returned {resp.status_code}"

    expected = load_fixture(fname)
    actual = resp.json()

    errors = _deep_compare(actual, expected)
    if errors:
        msg = f"Golden value mismatch for {fname}:\n" + "\n".join(errors[:20])
        if len(errors) > 20:
            msg += f"\n... and {len(errors) - 20} more"
        pytest.fail(msg)
