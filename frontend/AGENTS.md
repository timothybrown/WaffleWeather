<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Versioning

- Version is in `package.json` using CalVer format: `YYYY.M.D.N` (e.g. `2026.4.10.1`).
- `.N` is a daily build counter starting at `1`.
- **Always bump the version before committing.** If today's date matches the current version date, increment `.N`. Otherwise, set to today's date with `.1`.
- **Both `frontend/package.json` and `backend/pyproject.toml` must always have the same version.** CI enforces this — mismatched versions will fail the version check.
