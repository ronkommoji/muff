from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Server
    port: int = 3000

    # Sendblue
    sendblue_api_key: str
    sendblue_api_secret: str
    my_sendblue_number: str
    user_phone_number: str

    # Anthropic
    anthropic_api_key: str

    # Composio
    composio_api_key: str
    composio_user_id: str = "personal"

    # Supermemory
    supermemory_api_key: str

    # Database (legacy SQLite — kept for reference during migration)
    db_path: str = "./data/agent.db"

    # Convex
    convex_url: str = ""
    convex_deploy_key: str = ""

    # Dashboard optional basic auth (empty = disabled)
    dashboard_password: str = ""

    # Morning briefing cron job
    morning_briefing_enabled: bool = True
    morning_briefing_hour: int = 8
    morning_briefing_minute: int = 0
    morning_briefing_tz: str = "America/New_York"
    morning_briefing_prompt: str = (
        "Good morning! Give me a quick daily briefing: "
        "anything on my calendar today, and check if I have any urgent unread emails."
    )


settings = Settings()
