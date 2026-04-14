import httpx
from app.config import settings

SUPERMEMORY_BASE = "https://api.supermemory.ai"
CONTAINER_TAG = "personal-agent"

_HEADERS = {
    "Authorization": f"Bearer {settings.supermemory_api_key}",
    "Content-Type": "application/json",
}


async def add_memory(content: str, metadata: dict | None = None) -> dict:
    """Store a memory in Supermemory."""
    payload: dict = {
        "containerTag": CONTAINER_TAG,
        "memories": [
            {
                "content": content,
                "metadata": metadata or {},
            }
        ],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SUPERMEMORY_BASE}/v4/memories",
            headers=_HEADERS,
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()


async def search_memories(query: str, limit: int = 5) -> list[str]:
    """Search memories using the v4 search endpoint."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SUPERMEMORY_BASE}/v4/search",
            headers=_HEADERS,
            json={"q": query, "limit": limit, "containerTag": CONTAINER_TAG},
        )
        resp.raise_for_status()
        data = resp.json()

    return [r["memory"] for r in data.get("results", []) if r.get("memory")]


async def list_memories(limit: int = 50) -> list[dict]:
    """List all memories for the dashboard using the v4 list endpoint."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SUPERMEMORY_BASE}/v4/memories/list",
            headers=_HEADERS,
            json={"containerTags": [CONTAINER_TAG]},
        )
        resp.raise_for_status()
        entries = resp.json().get("memoryEntries", [])

    entries.sort(key=lambda e: e.get("createdAt", ""), reverse=True)
    return [
        {
            "content": e["memory"],
            "created_at": e.get("createdAt", ""),
            "id": e.get("id", ""),
            "is_static": e.get("isStatic", False),
        }
        for e in entries[:limit]
        if not e.get("isForgotten", False)
    ]
