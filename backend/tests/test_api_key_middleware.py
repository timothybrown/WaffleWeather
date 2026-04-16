# backend/tests/test_api_key_middleware.py
import hmac
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.database import get_db
from app.main import app


@pytest.mark.asyncio
async def test_api_key_rejection_uses_compare_digest():
    """Middleware must use hmac.compare_digest, not ==."""
    settings = Settings(api_key="correct-key")
    with patch("app.main.settings", settings), \
         patch("hmac.compare_digest", wraps=hmac.compare_digest) as spy:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get("/api/v1/observations", headers={"X-API-Key": "wrong"})
            assert r.status_code == 401
            assert spy.called, "hmac.compare_digest must be invoked"


@pytest.mark.asyncio
async def test_api_key_accepts_correct():
    settings = Settings(api_key="correct-key")

    # Mock DB so the stations handler can return an empty list after auth passes.
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with patch("app.main.settings", settings):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                r = await c.get("/api/v1/stations", headers={"X-API-Key": "correct-key"})
                assert r.status_code in (200, 404)  # 404 if no station seeded; auth passed
    finally:
        app.dependency_overrides.clear()
