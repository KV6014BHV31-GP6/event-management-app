from fastapi import APIRouter, Depends, status, UploadFile, File, Form, HTTPException
from src.auth.deps import get_current_user
from src.users.models import UserModel
from src.files.schemas import FileUploadResponse
from src.files.storage import get_storage_provider, BaseStorage
from src.core.config import settings

router = APIRouter(prefix="/files", tags=["Files"])

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "pdf", "csv"}


@router.post(
    "",
    response_model=FileUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload any supported binary asset to active storage engine"
)
async def upload_file_endpoint(
    file: UploadFile = File(...),
    folder: str = Form(
        default="general", description="Target subdirectory category (e.g. 'events', 'avatars')"),
    current_user: UserModel = Depends(get_current_user),
    storage_provider: BaseStorage = Depends(get_storage_provider)
):
    """
    Unified file processor endpoint. Seamlessly switches between local filesystem operations 
    and Google Cloud Storage based on server application configurations.
    """
    extension = file.filename.split(
        ".")[-1].lower() if "." in file.filename else ""
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        file_url = await storage_provider.upload(file=file, folder=folder)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload operation failed: {str(e)}"
        )
    finally:
        await file.close()

    return FileUploadResponse(
        filename=file.filename,
        url=file_url,
        provider=settings.STORAGE_PROVIDER
    )
