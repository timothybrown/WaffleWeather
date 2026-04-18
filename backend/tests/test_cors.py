"""CORS middleware configuration tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_cors_methods_restricted():
    """CORS must NOT advertise DELETE — only GET and OPTIONS."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.options(
            "/api/v1/stations",
            headers={
                "Origin": "http://localhost",
                "Access-Control-Request-Method": "DELETE",
            },
        )
        allow = r.headers.get("access-control-allow-methods", "")
        assert "DELETE" not in allow
        assert "GET" in allow


@pytest.mark.asyncio
async def test_cors_credentials_false():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.options(
            "/api/v1/stations",
            headers={
                "Origin": "http://localhost",
                "Access-Control-Request-Method": "GET",
            },
        )
        # allow_credentials=False should NOT emit "true" on this header
        assert r.headers.get("access-control-allow-credentials") != "true"
