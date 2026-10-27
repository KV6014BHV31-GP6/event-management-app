import os
import shutil
from abc import ABC, abstractmethod
from fastapi import UploadFile
from nanoid import generate
from google.cloud import storage
from src.core.config import settings


class BaseStorage(ABC):
    @abstractmethod
    async def upload(self, file: UploadFile, folder: str) -> str:
        """Uploads the file asset and returns its accessible path string or absolute web URL."""
        pass

# --- 1. Localhost Implementation ---


class LocalStorage(BaseStorage):
    async def upload(self, file: UploadFile, folder: str) -> str:
        extension = file.filename.split(
            ".")[-1].lower() if "." in file.filename else ""
        unique_filename = f"{generate(size=12)}.{extension}"

        relative_path = f"/{settings.UPLOAD_DIR}/{folder}/{unique_filename}"
        absolute_dir = os.path.join(os.getcwd(), settings.UPLOAD_DIR, folder)
        os.makedirs(absolute_dir, exist_ok=True)

        absolute_path = os.path.join(absolute_dir, unique_filename)

        with open(absolute_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return relative_path

# --- 2. Google Cloud Storage Implementation ---


class GoogleCloudStorage(BaseStorage):
    def __init__(self):
        if settings.GOOGLE_APPLICATION_CREDENTIALS:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
        self.client = storage.Client(project=settings.GCS_PROJECT_ID)
        self.bucket = self.client.bucket(settings.GCS_BUCKET_NAME)

    async def upload(self, file: UploadFile, folder: str) -> str:
        extension = file.filename.split(
            ".")[-1].lower() if "." in file.filename else ""
        unique_filename = f"{folder}/{generate(size=12)}.{extension}"

        blob = self.bucket.blob(unique_filename)
        # Stream file payload straight up into the cloud provider bucket
        blob.upload_from_file(file.file, content_type=file.content_type)

        return f"https://googleapis.com{settings.GCS_BUCKET_NAME}/{unique_filename}"

# --- Strategy Factory Guard ---


def get_storage_provider() -> BaseStorage:
    if settings.STORAGE_PROVIDER.lower() == "gcs":
        return GoogleCloudStorage()
    return LocalStorage()
