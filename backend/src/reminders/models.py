"""Austin reminder types; reminder tasks use the canonical Journey outbox."""
from enum import Enum
from src.journey.models import JourneyState as EventReminderModel

class ReminderTypeEnum(str, Enum):
    seven_days = '7d'
    one_day = '1d'
