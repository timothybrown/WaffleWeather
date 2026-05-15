"""Tests for output formatting helpers."""

import json

from app.cli._format import (
    Severity,
    badge,
    emit,
    format_age,
    summary_line,
)


def test_severity_values():
    assert Severity.OK == "ok"
    assert Severity.WARN == "warn"
    assert Severity.FAIL == "fail"


def test_badge_ok_uses_check():
    rendered = badge(Severity.OK)
    assert "✓" in rendered


def test_badge_fail_uses_cross():
    rendered = badge(Severity.FAIL)
    assert "✗" in rendered


def test_badge_warn_uses_warn_symbol():
    rendered = badge(Severity.WARN)
    # We use ! for warn to keep it visually distinct from check/cross
    assert "!" in rendered


def test_format_age_seconds():
    assert format_age(45) == "45s"


def test_format_age_minutes():
    assert format_age(90) == "1m 30s"


def test_format_age_hours():
    assert format_age(3700) == "1h 1m"


def test_format_age_days():
    assert format_age(90000) == "1d 1h"


def test_summary_line_all_ok():
    assert summary_line(passed=5, total=5) == "✓ 5/5 checks passing"


def test_summary_line_some_failing():
    assert summary_line(passed=3, total=5) == "✗ 2/5 checks failing"


def test_emit_json_round_trips(capsys):
    emit({"foo": "bar", "n": 42}, json_output=True)
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"foo": "bar", "n": 42}
