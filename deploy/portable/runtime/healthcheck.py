"""Read-only app/API/schema readiness; not acceptance or a business operation."""
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
import sys
try:
    with urlopen('http://127.0.0.1:8080/__container_health', timeout=4) as r:
        raise SystemExit(0 if r.status == 200 else 1)
except (URLError, HTTPError, TimeoutError):
    raise SystemExit(1)
