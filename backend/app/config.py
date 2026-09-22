from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FinApp API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://finapp:finapp@localhost:5432/finapp"
    frontend_origin: str = "http://localhost:5173"
    jwt_secret_key: str = "change-this-development-secret"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        # Render supplies its Postgres connection string as postgresql://...
        # while this application explicitly uses the psycopg 3 SQLAlchemy driver.
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        elif self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        if self.app_env.lower() == "production":
            if self.jwt_secret_key == "change-this-development-secret" or len(self.jwt_secret_key) < 32:
                raise ValueError("JWT_SECRET_KEY must be a random value of at least 32 characters in production")
            if "*" in self.frontend_origin or not self.frontend_origin.startswith("https://"):
                raise ValueError("FRONTEND_ORIGIN must be an explicit HTTPS origin in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
