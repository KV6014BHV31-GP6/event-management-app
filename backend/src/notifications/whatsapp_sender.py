"""Adapted from Austin b9dca01 notifications/whatsapp_sender.py.
Real Twilio transport: gated to one approved test recipient; no sensitive logging.
"""
import asyncio
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class DeliveryResult:
    status: str
    provider_id: str | None = None
    code: str | None = None

class SyntheticSender:
    async def send(self, *, phone_number, message):
        return DeliveryResult('dry_run', code='SYNTHETIC_TRANSPORT')

class WhatsAppSender:
    def __init__(self, *, client=None, source_number=None, test_recipient=None, enabled=None):
        self.enabled = enabled if enabled is not None else os.getenv('NU_NOTIFICATION_EXTERNAL_SEND') == 'yes'
        self.source_number = source_number or os.getenv('TWILIO_SANDBOX_NUMBER')
        self.test_recipient = test_recipient or os.getenv('NU_NOTIFICATION_TEST_RECIPIENT')
        self.client = client
        if self.enabled and self.client is None and self.source_number and self.test_recipient:
            sid, token = os.getenv('TWILIO_ACCOUNT_SID'), os.getenv('TWILIO_AUTH_TOKEN')
            if sid and token:
                try:
                    from twilio.rest import Client
                    from twilio.http.http_client import TwilioHttpClient
                    self.client = Client(sid, token, http_client=TwilioHttpClient(timeout=20))
                except ImportError:
                    pass

    async def send(self, *, phone_number, message):
        if not self.enabled or not self.client or not self.source_number or not self.test_recipient:
            return DeliveryResult('failed', code='EXTERNAL_DELIVERY_NOT_CONFIGURED')
        if phone_number != self.test_recipient:
            return DeliveryResult('failed', code='RECIPIENT_NOT_APPROVED')
        try:
            response = await asyncio.to_thread(self.client.messages.create,
                from_=f'whatsapp:{self.source_number}', body=message, to=f'whatsapp:{phone_number}')
            return DeliveryResult('accepted', response.sid)
        except Exception:
            return DeliveryResult('unknown', code='PROVIDER_RESULT_UNKNOWN')

    async def reconcile(self, provider_id):
        if not self.enabled or not self.client or not provider_id:
            return DeliveryResult('unknown', provider_id, 'RECONCILIATION_REQUIRED')
        try:
            response = await asyncio.to_thread(self.client.messages(provider_id).fetch)
            status = {'delivered':'delivered','read':'delivered','failed':'failed','undelivered':'failed'}.get(response.status,'accepted')
            return DeliveryResult(status, provider_id)
        except Exception:
            return DeliveryResult('unknown', provider_id, 'RECONCILIATION_REQUIRED')

def configured_sender():
    transport = os.getenv('NU_NOTIFICATION_TRANSPORT', 'dry_run')
    if transport == 'dry_run': return SyntheticSender()
    if transport == 'twilio': return WhatsAppSender()
    raise ValueError('Unsupported notification transport')
