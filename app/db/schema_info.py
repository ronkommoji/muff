"""
Static schema descriptions for the Convex DB viewer.
Provides column metadata in the same format as SQLite PRAGMA table_info.
"""

def _col(cid: int, name: str, typ: str, notnull: int = 1, pk: int = 0) -> dict:
    return {"cid": cid, "name": name, "type": typ, "notnull": notnull, "dflt_value": None, "pk": pk}


TABLE_SCHEMAS: dict[str, list[dict]] = {
    "messages": [
        _col(0, "_id", "TEXT", pk=1),
        _col(1, "messageHandle", "TEXT", notnull=0),
        _col(2, "fromNumber", "TEXT"),
        _col(3, "toNumber", "TEXT"),
        _col(4, "content", "TEXT"),
        _col(5, "role", "TEXT"),
        _col(6, "service", "TEXT"),
        _col(7, "createdAt", "REAL"),
    ],
    "toolCalls": [
        _col(0, "_id", "TEXT", pk=1),
        _col(1, "messageId", "TEXT", notnull=0),
        _col(2, "toolName", "TEXT"),
        _col(3, "inputJson", "TEXT", notnull=0),
        _col(4, "outputJson", "TEXT", notnull=0),
        _col(5, "createdAt", "REAL"),
    ],
    "usage": [
        _col(0, "_id", "TEXT", pk=1),
        _col(1, "messageId", "TEXT", notnull=0),
        _col(2, "model", "TEXT"),
        _col(3, "inputTokens", "INTEGER"),
        _col(4, "outputTokens", "INTEGER"),
        _col(5, "costUsd", "REAL"),
        _col(6, "createdAt", "REAL"),
    ],
    "sessions": [
        _col(0, "_id", "TEXT", pk=1),
        _col(1, "phoneNumber", "TEXT"),
        _col(2, "sessionId", "TEXT"),
        _col(3, "isActive", "INTEGER"),
        _col(4, "preview", "TEXT", notnull=0),
        _col(5, "createdAt", "REAL"),
        _col(6, "updatedAt", "REAL"),
    ],
    "logs": [
        _col(0, "_id", "TEXT", pk=1),
        _col(1, "level", "TEXT"),
        _col(2, "eventType", "TEXT"),
        _col(3, "message", "TEXT"),
        _col(4, "metadata", "TEXT", notnull=0),
        _col(5, "createdAt", "REAL"),
    ],
    "routines": [
        _col(0, "_id", "TEXT", pk=1),
        _col(1, "name", "TEXT"),
        _col(2, "prompt", "TEXT"),
        _col(3, "hour", "INTEGER"),
        _col(4, "minute", "INTEGER"),
        _col(5, "timezone", "TEXT"),
        _col(6, "enabled", "INTEGER"),
        _col(7, "lastRunAt", "REAL", notnull=0),
        _col(8, "createdAt", "REAL"),
    ],
    "kv": [
        _col(0, "_id", "TEXT", pk=1),
        _col(1, "key", "TEXT"),
        _col(2, "value", "TEXT", notnull=0),
    ],
}
