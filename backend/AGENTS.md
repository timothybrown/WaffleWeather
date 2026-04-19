# Versioning

- Version is in `pyproject.toml` using CalVer format: `YYYY.M.D.N` (e.g. `2026.4.10.1`).
- Dots are required (PEP 440 compliance). No leading zeros on month/day/build.
- `.N` is a daily build counter starting at `1`.
- **Only bump the version if you are the top-level orchestrator making the final commit.** Subagents working on individual tasks within a plan must NOT bump the version — it will be bumped once at the end after all tasks are complete.
- When bumping: if today's date matches the current version date, increment `.N`. Otherwise, set to today's date with `.1`.
- **Both `backend/pyproject.toml` and `frontend/package.json` must always have the same version.** CI enforces this — mismatched versions will fail the version check.
