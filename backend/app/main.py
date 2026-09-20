from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.auth import router as auth_router
from app.setup import router as setup_router
from app.transactions import router as transactions_router
from app.reports import router as reports_router
from app.bills import router as bills_router
from app.goals import router as goals_router
from app.budget import router as budget_router

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(setup_router, prefix=settings.api_v1_prefix)
app.include_router(transactions_router, prefix=settings.api_v1_prefix)
app.include_router(reports_router, prefix=settings.api_v1_prefix)
app.include_router(bills_router, prefix=settings.api_v1_prefix)
app.include_router(goals_router, prefix=settings.api_v1_prefix)
app.include_router(budget_router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "finapp-api"}


@app.get(f"{settings.api_v1_prefix}/health", tags=["system"])
def api_health() -> dict[str, str]:
    return {"status": "ok", "service": "finapp-api"}
