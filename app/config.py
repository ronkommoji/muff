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

    # Database
    db_path: str = "./data/agent.db"

    # Dashboard optional basic auth (empty = disabled)
    dashboard_password: str = ""


settings = Settings()
