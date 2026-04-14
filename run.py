"""Entry point — run with: python run.py"""
import os
from dotenv import load_dotenv

load_dotenv(override=True)

import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
        log_level="info",
    )
