import os
import logging
from twilio.rest import Client

logger = logging.getLogger(__name__)


class WhatsAppSender:
    """
    Production-ready wrapper for sending WhatsApp notifications via Twilio.
    """

    def __init__(self) -> None:
        # Load credentials directly from environmental variable footprints
        self.account_sid = os.environ["TWILIO_ACCOUNT_SID"]
        self.auth_token = os.environ["TWILIO_AUTH_TOKEN"]
        self.twilio_sandbox_number = os.environ["TWILIO_SANDBOX_NUMBER"]

        # Initialize internal Twilio client engine instance
        self.client = Client(self.account_sid, self.auth_token)

    async def send(
        self,
        phone_number: str,
        message: str
    ) -> bool:
        """
        Transmits a text payload string onto target channels via Twilio Sandbox.
        Returns True if successfully dispatched downstream, otherwise False.
        """
        logger.info(
            f"Initiating WhatsApp dispatch workflow to phone: {phone_number}")
        logger.debug(f"Payload context content body: {message}")

        try:
            # Execute dispatch onto the Twilio REST gateway infrastructure
            response = self.client.messages.create(
                from_=f"whatsapp:{self.twilio_sandbox_number}",
                body=message,
                to=f"whatsapp:{phone_number}"
            )

            logger.info(
                f"Twilio gateway successfully accepted message. Transaction SID footprint: {response.sid}")
            return True

        except Exception as exc:
            logger.error(
                f"Critical exception occurred inside Twilio gateway client pipeline: {str(exc)}")
            return False
