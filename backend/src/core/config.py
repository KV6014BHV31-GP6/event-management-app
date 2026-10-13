from typing import Literal
from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Fastapi_test"
    ENVIRONMENT: Literal["development",
                         "staging", "production"] = "development"
    API_V1_STR: str = "/api/v1"

    DATABASE_URL: str

    JWT_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


# Instantiate a singleton to reuse across your application
settings = Settings()
