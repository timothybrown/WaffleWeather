"""Shared fixtures for CLI tests."""

import inspect

import pytest
from click.testing import CliRunner


@pytest.fixture
def runner() -> CliRunner:
    """A Click CliRunner with stdout/stderr asserted separately.

    Click <8.2 needed ``mix_stderr=False`` for separate streams; in Click 8.2+
    that kwarg was removed and stderr is always separate. Detect and adapt.
    """
    if "mix_stderr" in inspect.signature(CliRunner.__init__).parameters:
        return CliRunner(mix_stderr=False)
    return CliRunner()
