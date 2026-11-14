import ulid
import os
from datetime import datetime, timezone
from typing import Dict, List
from fastapi import UploadFile
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import EventModel, EventStatusEnum
from src.participants.models import ParticipantModel
from src.registrations.models import (
    RegistrationModel,
    RegistrationStatusEnum,
    RegistrationChannelEnum,
    UserGenderEnum,
    RegistrationFileModel
)
# Assuming a generic FileModel exists based on table schemas provided
from src.registrations.models import RegistrationFileModel
# Note: Ensure FileModel is imported correctly from your actual project layout
# from src.files.models import FileModel

from src.offline_sync.schemas import (
    OfflineBatchSyncPayload,
    OfflineApplicationItem,
    OfflineSyncBatchResponse,
    SuccessfulRegistrationItem,
    FailedRegistrationItem
)

# Custom exception to capture standard recommended code outputs smoothly


class RegistrationSyncException(Exception):
    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(message)


class OfflineSyncService:
    @staticmethod
    async def sync_offline_registrations(
        db: AsyncSession,
        event_public_id: str,
        payload: OfflineBatchSyncPayload,
        file_mapping: Dict[str, UploadFile],
        leader_user: any
    ) -> OfflineSyncBatchResponse:
        """
        Processes batch synchronized client application structures.
        Executes an isolated transaction workflow (BEGIN -> COMMIT/ROLLBACK) for each registration.
        """
        successful_registrations: List[SuccessfulRegistrationItem] = []
        failed_registrations: List[FailedRegistrationItem] = []

        # 1. Broad Destination Scope Validations (Applies to the entire event destination)
        event_stmt = select(EventModel).where(
            EventModel.public_id == event_public_id)
        event_res = await db.execute(event_stmt)
        event = event_res.scalar_one_or_none()

        if not event:
            for app in payload.applications:
                failed_registrations.append(
                    FailedRegistrationItem(
                        registration_id=app.registration_id,
                        error_code="EVENT_NOT_FOUND",
                        message=f"Event associated with public identifier '{event_public_id}' does not exist."
                    )
                )
            return OfflineSyncBatchResponse(
                batch_id=payload.batch_id,
                total_registrations=len(payload.applications),
                success_count=0,
                failed_count=len(payload.applications),
                successful_registrations=[],
                failed_registrations=failed_registrations
            )

        if event.status != EventStatusEnum.active:
            for app in payload.applications:
                failed_registrations.append(
                    FailedRegistrationItem(
                        registration_id=app.registration_id,
                        error_code="REGISTRATION_CLOSED",
                        message="Batch transfer aborted. Target event destination registry is not active."
                    )
                )
            return OfflineSyncBatchResponse(
                batch_id=payload.batch_id,
                total_registrations=len(payload.applications),
                success_count=0,
                failed_count=len(payload.applications),
                successful_registrations=[],
                failed_registrations=failed_registrations
            )

        # 2. Iterate through each registration application in an isolated execution loop
        for app in payload.applications:
            try:
                # Process a single registration record wrapped inside its own explicit savepoint/transaction
                async with db.begin_nested():
                    await OfflineSyncService._process_single_application(
                        db=db,
                        event=event,
                        app=app,
                        file_mapping=file_mapping,
                        leader_id=leader_user.id
                    )

                # Append to successful list after clean inner nested-commit completion
                successful_registrations.append(
                    SuccessfulRegistrationItem(
                        registration_id=app.registration_id)
                )
            except RegistrationSyncException as ex:
                # Capture custom controlled validation business constraint errors safely
                failed_registrations.append(
                    FailedRegistrationItem(
                        registration_id=app.registration_id,
                        error_code=ex.error_code,
                        message=ex.message
                    )
                )
            except Exception as ex:
                # Catch unexpected database exceptions or constraint failures
                failed_registrations.append(
                    FailedRegistrationItem(
                        registration_id=app.registration_id,
                        error_code="INTERNAL_ERROR",
                        message=f"An unexpected storage exception occurred: {str(ex)}"
                    )
                )

        # 3. Perform a final commit for the outer session block to flush nested states safely
        await db.commit()

        return OfflineSyncBatchResponse(
            batch_id=payload.batch_id,
            total_registrations=len(payload.applications),
            success_count=len(successful_registrations),
            failed_count=len(failed_registrations),
            successful_registrations=successful_registrations,
            failed_registrations=failed_registrations
        )

    @staticmethod
    async def _process_single_application(
        db: AsyncSession,
        event: EventModel,
        app: OfflineApplicationItem,
        file_mapping: Dict[str, UploadFile],
        leader_id: str
    ):
        now_utc = datetime.now(timezone.utc)

        # --- Step A: Validate Fields ---
        if not app.first_name.strip():
            raise RegistrationSyncException(
                "INVALID_FIRST_NAME", "First name cannot be left blank.")
        if not app.last_name.strip():
            raise RegistrationSyncException(
                "INVALID_LAST_NAME", "Last name cannot be left blank.")
        if app.gender not in ("male", "female"):
            raise RegistrationSyncException(
                "INVALID_GENDER", "Gender must match 'male' or 'female'.")
        if app.date_of_birth >= now_utc.date():
            raise RegistrationSyncException(
                "INVALID_DATE_OF_BIRTH", "Date of birth must represent a valid past timeline.")
        if not app.phone.strip():
            raise RegistrationSyncException(
                "INVALID_PHONE", "Phone coordinate cannot be left blank.")
        if not app.address.strip():
            raise RegistrationSyncException(
                "INVALID_ADDRESS", "Physical street address description is required.")
        if not app.national_id.strip():
            raise RegistrationSyncException(
                "INVALID_NATIONAL_ID", "National Identity layout cannot be blank.")

        # Validate attached document collection boundaries
        if len(app.documents) > 3:
            raise RegistrationSyncException(
                "FILE_TOO_LARGE",
                "Registration rejected. You can upload a maximum of 3 supporting documents."
            )
        # --- Step B: Capacity Check ---
        # total_capacity = event.online_quota + event.offline_quota
        # count_stmt = (
        #     select(func.count())
        #     .select_from(RegistrationModel)
        #     .where(
        #         RegistrationModel.event_id == event.id,
        #         RegistrationModel.status == RegistrationStatusEnum.approved
        #     )
        # )
        # count_res = await db.execute(count_stmt)
        # if count_res.scalar_one() >= total_capacity:
        #     raise RegistrationSyncException(
        #         "EVENT_FULL", "Event capacity quota configurations have been reached.")

        # --- Step C: Duplicate Import Checks ---
        dup_reg_stmt = select(RegistrationModel).where(
            RegistrationModel.id == app.registration_id)
        dup_reg_res = await db.execute(dup_reg_stmt)
        if dup_reg_res.scalar_one_or_none():
            raise RegistrationSyncException(
                "REGISTRATION_ALREADY_IMPORTED", "This registration ID already exists within central records.")

        # --- Step D: Search or Upsert Participant Records ---
        part_stmt = select(ParticipantModel).where(
            ParticipantModel.national_id == app.national_id)
        part_res = await db.execute(part_stmt)
        db_participant = part_res.scalar_one_or_none()

        gender_enum = UserGenderEnum(app.gender)

        if db_participant:
            participant_id = db_participant.id

            # Identify changes to update profile tracking metrics dynamically
            has_changes = (
                db_participant.first_name != app.first_name or
                db_participant.last_name != app.last_name or
                db_participant.gender != gender_enum or
                db_participant.date_of_birth != app.date_of_birth or
                db_participant.phone != app.phone or
                db_participant.address != app.address
            )
            if has_changes:
                db_participant.first_name = app.first_name
                db_participant.last_name = app.last_name
                db_participant.gender = gender_enum
                db_participant.date_of_birth = app.date_of_birth
                db_participant.phone = app.phone
                db_participant.address = app.address
                db_participant.updated_at = now_utc
                db_participant.updated_by_user_id = leader_id
                db.add(db_participant)
        else:
            # Instantiate entirely new structural participant references
            new_p = ParticipantModel(
                id=str(ulid.ULID()),
                user_id=None,
                first_name=app.first_name,
                last_name=app.last_name,
                gender=gender_enum,
                date_of_birth=app.date_of_birth,
                phone=app.phone,
                address=app.address,
                national_id=app.national_id,
                created_at=now_utc,
                updated_at=now_utc
            )
            db.add(new_p)
            participant_id = new_p.id

        # Check for another active registration for this exact participant to avoid duplicates
        active_dup_stmt = select(RegistrationModel).where(
            RegistrationModel.event_id == event.id,
            RegistrationModel.participant_id == participant_id,
            RegistrationModel.status != RegistrationStatusEnum.cancelled
        )
        active_dup_res = await db.execute(active_dup_stmt)
        if active_dup_res.scalar_one_or_none():
            raise RegistrationSyncException(
                "DUPLICATE_PARTICIPANT", "An active entry configuration already maps to this profile resource.")

        # --- DEBUG LOGGING: Service Mapping Lookup ---
        # print(
            # f"\n[DEBUG SERVICE] Processing Registration: {app.registration_id}")
        # print(
            # f"  -> Available keys in file_mapping: {list(file_mapping.keys())}")
        # print(
            # f"  -> Documents requested in JSON: {[doc.file_ref for doc in app.documents]}")
        # ---------------------------------------------

        # --- Step E: Handle Multipart Multi-file Persistence Operations ---
        file_ids_to_map: List[str] = []
        upload_dir = "storage/uploads"
        os.makedirs(upload_dir, exist_ok=True)

        for doc in app.documents:
            f_ref = doc.file_ref
            if f_ref not in file_mapping:
                continue

            uploaded_file = file_mapping[f_ref]
            generated_file_id = str(ulid.ULID())
            _, ext = os.path.splitext(uploaded_file.filename or "")
            storage_filename = f"{generated_file_id}{ext}"
            storage_path = os.path.join(upload_dir, storage_filename)

            # Ensure we reset the spool pointer index head before reading chunks asynchronously
            await uploaded_file.seek(0)

            # 1. Physically persist raw multi-part block down onto disk space async-style
            file_size = 0
            with open(storage_path, "wb") as buffer:
                while chunk := await uploaded_file.read(1024 * 1024):
                    file_size += len(chunk)
                    buffer.write(chunk)

            # Reset stream bookmark index position safely for subsequent operations
            await uploaded_file.seek(0)

            # 2. Add File metadata instance straight to current tracking transaction
            from src.files.models import FileModel
            file_record = FileModel(
                id=generated_file_id,
                original_file_name=uploaded_file.filename or "unknown",
                mime_type=uploaded_file.content_type or "application/octet-stream",
                file_size=file_size,
                storage_path=storage_path,
                created_at=now_utc
            )
            db.add(file_record)
            file_ids_to_map.append(generated_file_id)

        # --- Step F: Create Core Registrations Entry Matrix ---
        new_registration = RegistrationModel(
            id=app.registration_id,
            event_id=event.id,
            participant_id=participant_id,
            created_by_user_id=leader_id,
            channel=RegistrationChannelEnum.offline,
            status=RegistrationStatusEnum.pending,
            created_at=now_utc,
            updated_at=now_utc,
            first_name=app.first_name,
            last_name=app.last_name,
            gender=gender_enum,
            age_group_code=app.age_group_code,
            date_of_birth=app.date_of_birth,
            phone=app.phone,
            address=app.address,
            national_id=app.national_id,
            income_band_code=app.income_band_code
        )
        db.add(new_registration)

        # --- Step G: Save Registration-to-Files Mapping Entities ---
        for fid in file_ids_to_map:
            mapping_row = RegistrationFileModel(
                registration_id=app.registration_id,
                file_id=fid,
                created_at=now_utc
            )
            db.add(mapping_row)

        # Force flush changes to sync memory constraints down to the engine before completing the nested block
        await db.flush()
