from __future__ import annotations


class ApiError(Exception):
    """Raised by services; rendered as {"error": {"code", "message"}} with the given HTTP status."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
