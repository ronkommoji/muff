import httpx
from app.config import settings

SUPERMEMORY_BASE = "https://api.supermemory.ai"
CONTAINER_TAG = "personal-agent"

_HEADERS = {
    "Authorization": f"Bearer {settings.supermemory_api_key}",
    "Content-Type": "application/json",
}


async def add_memory(content: str, is_static: bool = False, metadata: dict | None = None) -> dict:
    """Store a memory in Supermemory.

    is_static=True: permanent traits that should never be overwritten (name, school, profession).
    is_static=False: preferences, habits, opinions that may evolve over time.
    """
    payload: dict = {
        "containerTag": CONTAINER_TAG,
        "memories": [
            {
                "content": content,
                "isStatic": is_static,
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
    timeout = httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{SUPERMEMORY_BASE}/v4/search",
            headers=_HEADERS,
            json={"q": query, "limit": limit, "containerTag": CONTAINER_TAG},
        )
        resp.raise_for_status()
        data = resp.json()

    return [r["memory"] for r in data.get("results", []) if r.get("memory")]


async def get_graph(limit: int = 200) -> dict:
    """Fetch the knowledge graph from Supermemory's graph viewport API.

    Returns documents (each containing their nested memories) plus semantic
    edges between memories with similarity scores and relation types.
    Uses an extremely large viewport bounding box to capture all content.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SUPERMEMORY_BASE}/v3/graph/viewport",
            headers=_HEADERS,
            json={
                "viewport": {
                    "minX": -1_000_000,
                    "maxX": 1_000_000,
                    "minY": -1_000_000,
                    "maxY": 1_000_000,
                },
                "containerTags": [CONTAINER_TAG],
                "limit": limit,
            },
        )
        resp.raise_for_status()
        return resp.json()


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
            "metadata": e.get("metadata", {}),
        }
        for e in entries[:limit]
        if not e.get("isForgotten", False)
    ]
