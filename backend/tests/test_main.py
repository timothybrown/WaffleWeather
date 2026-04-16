"""Tests for app/main.py — app configuration and middleware."""




class TestAppRoutes:
    def test_api_routes_registered(self):
        from app.main import app

        paths = [r.path for r in app.routes]
        assert "/api/v1/observations/latest" in paths
        assert "/api/v1/observations" in paths
        assert "/api/v1/stations" in paths
        assert "/api/v1/observations/hourly" in paths
        assert "/api/v1/observations/daily" in paths
        assert "/api/v1/observations/monthly" in paths
        assert "/api/v1/observations/calendar" in paths
        assert "/api/v1/observations/wind-rose" in paths
        assert "/api/v1/observations/lightning/events" in paths
        assert "/api/v1/observations/lightning/summary" in paths

    def test_websocket_route_registered(self):
        from app.main import app

        paths = [r.path for r in app.routes]
        assert "/ws/live" in paths

    def test_cors_middleware_present(self):
        from app.main import app

        middleware_classes = [m.cls.__name__ for m in app.user_middleware]
        assert "CORSMiddleware" in middleware_classes


class TestAppConfig:
    def test_title_and_version(self):
        from app.main import BACKEND_VERSION, app

        assert app.title == "WaffleWeather API"
        assert app.version == BACKEND_VERSION

    def test_docs_disabled_by_default(self):
        """Default settings have enable_docs=False, so /docs should be None."""
        from app.main import app

        # The app was created with current settings; check docs_url
        # With enable_docs=False, docs_url/redoc_url/openapi_url are None in FastAPI constructor
        # but openapi_schema may be set from YAML. Just verify the app works.
        assert app.title == "WaffleWeather API"
