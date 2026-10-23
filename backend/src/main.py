from fastapi import FastAPI
from src.core.config import settings
from src.users.router import router as users_router
from src.auth.router import router as auth_router
from src.events.router import router as events_router
from src.participants.router import router as participant_router
<<<<<<< Updated upstream
=======
from src.files.router import router as files_router
from src.registrations.router import router as registration_router
from src.offline_sync.router import router as offline_sync_router
>>>>>>> Stashed changes


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url=f"{settings.API_V1_STR}/docs" if settings.ENVIRONMENT != "production" else None,
)

app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(users_router, prefix=settings.API_V1_STR)
app.include_router(events_router, prefix=settings.API_V1_STR)
app.include_router(participant_router, prefix=settings.API_V1_STR)
<<<<<<< Updated upstream
=======
app.include_router(files_router, prefix=settings.API_V1_STR)
app.include_router(registration_router, prefix=settings.API_V1_STR)
app.include_router(offline_sync_router, prefix=settings.API_V1_STR)
>>>>>>> Stashed changes


@app.get("/")
def read_root():
    return {"status": "healthy", "environment": settings.ENVIRONMENT}
