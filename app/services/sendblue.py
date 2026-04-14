import httpx
from dataclasses import dataclass, field
from app.config import settings

SENDBLUE_BASE = "https://api.sendblue.co"

_HEADERS = {
    "sb-api-key-id": settings.sendblue_api_key,
    "sb-api-secret-key": settings.sendblue_api_secret,
    "Content-Type": "application/json",
}


@dataclass
class SendbluePayload:
    """Shape of the incoming Sendblue webhook POST body."""
    content: str = ""
    from_number: str = ""
    to_number: str = ""
    sendblue_number: str = ""
    is_outbound: bool = False
    status: str = ""
    message_handle: str = ""
    date_sent: str = ""
    date_updated: str = ""
    service: str = "iMessage"
    media_url: str = ""
    message_type: str = "message"
    group_id: str = ""
    participants: list = field(default_factory=list)
    was_downgraded: bool | None = None
    opted_out: bool = False
    # Extra fields Sendblue may include — captured via __post_init__
    _extra: dict = field(default_factory=dict, repr=False)

    @classmethod
    def from_dict(cls, data: dict) -> "SendbluePayload":
        known = {f.name for f in cls.__dataclass_fields__.values() if not f.name.startswith("_")}
        kwargs = {k: v for k, v in data.items() if k in known}
        obj = cls(**kwargs)
        obj._extra = {k: v for k, v in data.items() if k not in known}
        return obj


async def send_message(to: str, content: str) -> dict:
    """Send an iMessage via Sendblue."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SENDBLUE_BASE}/api/send-message",
            headers=_HEADERS,
            json={
                "number": to,
                "from_number": settings.my_sendblue_number,
                "content": content,
            },
        )
        resp.raise_for_status()
        return resp.json()
