import asyncio

import mcp_server.server as server


def test_legacy_procedural_posture_alias_delegates_to_canonical_tool(monkeypatch):
    calls = {}

    async def fake_procedural_posture(ctx, case_id, app_id=None):
        calls.update(ctx=ctx, case_id=case_id, app_id=app_id)
        return {"status": "ok", "caseId": case_id, "appId": app_id}

    monkeypatch.setattr(server, "procedural_posture", fake_procedural_posture)
    result = asyncio.run(server.get_procedural_posture("ctx", "73181283", "2"))

    assert result == {"status": "ok", "caseId": "73181283", "appId": "2"}
    assert calls == {"ctx": "ctx", "case_id": "73181283", "app_id": "2"}


def test_document_search_tools_forward_product_scope(monkeypatch):
    calls = []

    async def fake_post(ctx, path, body):
        calls.append((ctx, path, body))
        return body

    monkeypatch.setattr(server, "_post", fake_post)
    for tool in (server.search_documents, server.search_documents_for_excerpts, server.rag_search):
        result = asyncio.run(tool("ctx", "73181283", "stay order", app_id="2"))
        assert result["caseId"] == "73181283"
        assert result["docketId"] == "73181283"
        assert result["appId"] == "2"

    assert len(calls) == 3
    assert all(path == "/api/rag-query-proxy/" for _, path, _ in calls)
