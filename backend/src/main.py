from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from src.core.config import settings
from src.users.router import router as users_router
from src.auth.router import router as auth_router
from src.events.router import router as events_router
from src.participants.router import router as participant_router
from src.files.router import router as files_router
from src.registrations.router import router as registration_router
from src.offline_sync.router import router as offline_sync_router
from src.phase2.router import router as phase2_router
from src.journey.router import router as journey_router
from src.accounts.router import router as accounts_router


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url=f"{settings.API_V1_STR}/docs" if settings.ENVIRONMENT != "production" else None,
)

app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(users_router, prefix=settings.API_V1_STR)
app.include_router(events_router, prefix=settings.API_V1_STR)
app.include_router(participant_router, prefix=settings.API_V1_STR)
app.include_router(files_router, prefix=settings.API_V1_STR)
app.include_router(registration_router, prefix=settings.API_V1_STR)
app.include_router(offline_sync_router, prefix=settings.API_V1_STR)
app.include_router(phase2_router)
app.include_router(accounts_router)
app.include_router(journey_router)

@app.exception_handler(RequestValidationError)
async def bounded_sync_validation(request,exc):
    if request.url.path.startswith('/api/v2/operations'):
        return JSONResponse(status_code=422,content={'detail':{'code':'INVALID_INPUT','message':'Invalid operations input'}})
    if request.url.path.startswith('/api/v2/events/') and '/offline-batches' in request.url.path:
        return JSONResponse(status_code=422,content={'detail':'Invalid synchronization envelope; finite JSON and versioned schema required.'})
    return await request_validation_exception_handler(request,exc)


@app.get("/")
def read_root():
    return {"status": "healthy", "environment": settings.ENVIRONMENT}
