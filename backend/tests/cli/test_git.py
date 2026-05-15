"""Tests for git wrappers."""

import subprocess
from unittest.mock import patch

from app.cli._git import (
    STABLE_TAG_RE,
    current_tag,
    filter_stable_tags,
    is_working_tree_clean,
    parse_github_url,
    pick_latest_stable,
    tag_compare,
)


def test_stable_tag_regex():
    assert STABLE_TAG_RE.match("v2026.5.14.2")
    assert STABLE_TAG_RE.match("2026.5.14.2")  # leading v optional
    assert not STABLE_TAG_RE.match("v2026.5.14.2-rc1")
    assert not STABLE_TAG_RE.match("main")
    assert not STABLE_TAG_RE.match("abc1234")


def test_filter_stable_tags_strips_prerelease():
    tags = ["v2026.5.14.2", "v2026.5.14.2-rc1", "main", "v2026.5.13.0"]
    assert filter_stable_tags(tags) == ["v2026.5.14.2", "v2026.5.13.0"]


def test_pick_latest_stable_handles_calver():
    tags = ["v2026.4.18.3", "v2026.5.6.2", "v2026.5.14.2"]
    assert pick_latest_stable(tags) == "v2026.5.14.2"


def test_pick_latest_stable_returns_none_on_empty():
    assert pick_latest_stable([]) is None


def test_tag_compare_newer():
    assert tag_compare("v2026.5.6.2", "v2026.5.14.2") < 0


def test_tag_compare_older():
    assert tag_compare("v2026.5.14.2", "v2026.5.6.2") > 0


def test_tag_compare_equal():
    assert tag_compare("v2026.5.14.2", "v2026.5.14.2") == 0


def test_current_tag_uses_describe(tmp_path):
    repo = tmp_path
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=["git"], returncode=0, stdout=b"v2026.5.14.2\n", stderr=b""
        )
        assert current_tag(repo) == "v2026.5.14.2"


def test_current_tag_returns_none_when_not_on_tag(tmp_path):
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=["git"], returncode=128, stdout=b"", stderr=b"fatal: no tag exactly matches\n"
        )
        assert current_tag(tmp_path) is None


def test_is_working_tree_clean_true(tmp_path):
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=["git"], returncode=0, stdout=b"", stderr=b""
        )
        assert is_working_tree_clean(tmp_path) is True


def test_is_working_tree_clean_false(tmp_path):
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = subprocess.CompletedProcess(
            args=["git"], returncode=0, stdout=b" M deploy/nginx.conf\n", stderr=b""
        )
        assert is_working_tree_clean(tmp_path) is False


def test_parse_github_url_https():
    owner, repo = parse_github_url("https://github.com/foo/bar.git")
    assert (owner, repo) == ("foo", "bar")


def test_parse_github_url_ssh():
    owner, repo = parse_github_url("git@github.com:foo/bar.git")
    assert (owner, repo) == ("foo", "bar")


def test_parse_github_url_no_dot_git():
    owner, repo = parse_github_url("https://github.com/foo/bar")
    assert (owner, repo) == ("foo", "bar")


def test_parse_github_url_non_github_returns_none():
    assert parse_github_url("https://gitlab.com/foo/bar.git") is None
