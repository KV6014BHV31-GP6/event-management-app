"""Austin notification storage adapted to the existing canonical Journey outbox.

No second notifications table or independent delivery success flag is created.
"""
from src.journey.models import JourneyState as NotificationModel
