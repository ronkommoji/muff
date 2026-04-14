from fastapi import APIRouter, BackgroundTasks, Request
from app.services.sendblue import SendbluePayload
from app.agent.runner import run_agent

router = APIRouter()


@router.post("/sendblue")
async def sendblue_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receive incoming iMessages from Sendblue.
    Acks immediately (200) and processes the agent loop in the background.
    """
    data = await request.json()
    payload = SendbluePayload.from_dict(data)
    background_tasks.add_task(run_agent, payload)
    return {"status": "ok"}
