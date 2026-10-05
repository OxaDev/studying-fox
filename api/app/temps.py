from datetime import UTC, datetime


def maintenant() -> datetime:
    """Date et heure actuelles, toujours en UTC."""
    return datetime.now(UTC)
