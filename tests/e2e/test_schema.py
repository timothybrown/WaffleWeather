"""Schema validation tests — every endpoint returns 200 and matches OpenAPI spec."""

from __future__ import annotations

import jsonschema
import pytest

from endpoints import SCHEMA_ENDPOINTS, Endpoint


def _resolve_ref(ref: str, spec: dict) -> dict:
    """Resolve a $ref pointer in the OpenAPI spec."""
    parts = ref.lstrip("#/").split("/")
    node = spec
    for part in parts:
        node = node[part]
    return node


def _resolve_schema(schema: dict, spec: dict) -> dict:
    """Recursively resolve $ref pointers in a schema."""
    if "$ref" in schema:
        return _resolve_schema(_resolve_ref(schema["$ref"], spec), spec)
    if "items" in schema:
        schema = {**schema, "items": _resolve_schema(schema["items"], spec)}
    if "properties" in schema:
        props = {}
        for k, v in schema["properties"].items():
            props[k] = _resolve_schema(v, spec)
        schema = {**schema, "properties": props}
    if "oneOf" in schema:
        schema = {**schema, "oneOf": [_resolve_schema(s, spec) for s in schema["oneOf"]]}
    if "additionalProperties" in schema and isinstance(schema["additionalProperties"], dict):
        schema = {
            **schema,
            "additionalProperties": _resolve_schema(schema["additionalProperties"], spec),
        }
    if schema.get("nullable"):
        schema = {k: v for k, v in schema.items() if k != "nullable"}
        if "type" in schema:
            schema["type"] = [schema["type"], "null"]
    return schema


def _get_response_schema(endpoint: Endpoint, spec: dict) -> dict | None:
    """Extract the 200 response schema for an endpoint from the OpenAPI spec."""
    path_key = endpoint.path
    for param_name in ["station_id"]:
        if f"/{endpoint.params.get(param_name, '')}/" in path_key or path_key.endswith(
            f"/{endpoint.params.get(param_name, '')}"
        ):
            path_key = path_key.replace(
                f"/{endpoint.params[param_name]}", f"/{{{param_name}}}"
            )

    path_spec = spec.get("paths", {}).get(path_key)
    if not path_spec:
        return None
    get_spec = path_spec.get("get")
    if not get_spec:
        return None
    resp_200 = get_spec.get("responses", {}).get("200", {})
    content = resp_200.get("content", {})
    ct = endpoint.content_type
    if ct not in content:
        return None
    return _resolve_schema(content[ct].get("schema", {}), spec)


@pytest.mark.parametrize(
    "endpoint",
    SCHEMA_ENDPOINTS,
    ids=[ep.path for ep in SCHEMA_ENDPOINTS],
)
def test_endpoint_returns_200(client, endpoint: Endpoint) -> None:
    resp = client.get(endpoint.path, params=endpoint.params)
    assert resp.status_code == 200, f"{endpoint.path} returned {resp.status_code}: {resp.text[:200]}"


@pytest.mark.parametrize(
    "endpoint",
    [ep for ep in SCHEMA_ENDPOINTS if ep.content_type == "application/json"],
    ids=[ep.path for ep in SCHEMA_ENDPOINTS if ep.content_type == "application/json"],
)
def test_endpoint_matches_schema(client, openapi_spec, endpoint: Endpoint) -> None:
    resp = client.get(endpoint.path, params=endpoint.params)
    assert resp.status_code == 200

    schema = _get_response_schema(endpoint, openapi_spec)
    if schema is None:
        pytest.skip(f"No OpenAPI schema found for {endpoint.path}")

    jsonschema.validate(instance=resp.json(), schema=schema)
