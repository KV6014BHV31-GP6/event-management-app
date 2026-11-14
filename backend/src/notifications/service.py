import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications.repo import NotificationRepository
from src.notifications.schemas import NotificationCreateInternal, NotificationTypeLiteral, RegistrationContext
from src.notifications.models import NotificationModel
from src.notifications.whatsapp_sender import WhatsAppSender

logger = logging.getLogger(__name__)


class NotificationService:
    @staticmethod
    async def create_notification(
        db: AsyncSession,
        notification_type: NotificationTypeLiteral,
        registration_id: Optional[str] = None,
        scheduled_at: Optional[datetime] = None
    ) -> NotificationModel:
        """
        Creates a notification tracking record within the current database transaction context.
        """
        schema_in = NotificationCreateInternal(
            notification_type=notification_type,
            registration_id=registration_id,
            scheduled_at=scheduled_at
        )

        db_notification = NotificationRepository.create(
            db=db, schema_in=schema_in)
        await db.flush()
        return db_notification

    async def process_pending_notifications(
        self,
        db: AsyncSession,
        whatsapp_sender: WhatsAppSender
    ) -> None:
        """
        Invoked periodically by APScheduler. Batch loads pending records,
        delegating execution flows onto the process_notification runner method.
        """
        # 1. Load available pending collections
        notifications = await NotificationRepository.get_pending_notifications(db=db, limit=100)

        if not notifications:
            logger.debug("No pending notifications found to process.")
            return

        logger.info(
            f"Found {len(notifications)} pending notifications to process.")

        # 2. Direct pipeline loops
        for notification in notifications:
            try:
                await self.process_notification(
                    db=db,
                    notification=notification,
                    whatsapp_sender=whatsapp_sender
                )
            except Exception as e:
                logger.exception(
                    f"Unexpected transaction system collapse handling profile ID {notification.id}: {str(e)}"
                )
                continue

    async def build_message(
        self,
        notification_type: str,
        context: RegistrationContext
    ) -> str:
        """
        Compiles and renders a highly tailored WhatsApp string payload based on the targeted 
        notification type using the pre-fetched flattened registration context data.
        """
        attendee_name = context.participant_name or "Valued Guest"
        event_title = context.event_title or "our upcoming event"

        event_date = ""
        if context.event_start_time:
            event_date = context.event_start_time.strftime("%Y-%m-%d %H:%M")

        # Comprehensive type matrix rendering rules driven by contextual parameters
        if notification_type == "registration_submitted":
            return f"Hello {attendee_name}, your registration for '{event_title}' has been successfully submitted and is under review."

        elif notification_type == "registration_approved":
            return f"Great news {attendee_name}! Your registration for '{event_title}' on {event_date} has been APPROVED. See you there!"

        elif notification_type == "registration_waitlisted":
            return f"Hello {attendee_name}, '{event_title}' is currently full. You have been added to the waitlist. We will notify you if a slot opens up."

        elif notification_type == "registration_cancelled":
            return f"Hello {attendee_name}, your registration for '{event_title}' has been officially cancelled."

        elif notification_type == "waitlist_promoted":
            return f"Good news {attendee_name}! You have been promoted from the waitlist for '{event_title}'. Your spot is now reserved."

        elif notification_type == "event_reminder_7_days":
            return f"Hi {attendee_name}, this is a friendly reminder that '{event_title}' is happening in 7 days on {event_date}. Get ready!"

        elif notification_type == "event_reminder_1_day":
            return f"Hi {attendee_name}, see you tomorrow! '{event_title}' starts in less than 24 hours on {event_date}."

        else:
            logger.warning(
                f"Unrecognized notification type mapping requested: {notification_type}")
            return f"Hello {attendee_name}, this is a status update regarding your registration for '{event_title}'."

    async def process_notification(
        self,
        db: AsyncSession,
        notification: NotificationModel,
        whatsapp_sender: WhatsAppSender
    ) -> None:
        """
        Executes the granular processing lifecycle matrix bounds for an individual notification.
        """
        # 1. Update status tracking to processing state
        await NotificationRepository.mark_processing(db=db, notification_id=notification.id)

        try:
            if not notification.registration_id:
                raise ValueError(
                    f"Notification schema target missing or decoupled on entity context: {notification.id}"
                )

            # 2. Fetch the pre-flattened and joined data payload context
            context = await NotificationRepository.get_registration_context(
                db=db,
                registration_id=notification.registration_id
            )

            if not context:
                raise ValueError(
                    f"Registration context could not be compiled for registration ID: {notification.registration_id}"
                )

            # 3. Compile the tailored text payload string using the new context schema
            message = await self.build_message(
                notification_type=notification.notification_type,
                context=context
            )

            # 4. Transmit details onto physical downstream channels using the whatsapp_sender parameter
            success = await whatsapp_sender.send(
                phone_number=context.participant_phone,
                message=message
            )

            if success:
                await NotificationRepository.mark_sent(db=db, notification_id=notification.id)
                await db.commit()
            else:
                raise RuntimeError(
                    "Downstream gateway handler failed to accept transmission parameters"
                )

        except Exception as exc:
            error_msg = str(exc) if str(
                exc) else "Internal runtime pipeline cancellation exception"
            await NotificationRepository.mark_failed(
                db=db,
                notification_id=notification.id,
                error_message=error_msg
            )
            await db.commit()
