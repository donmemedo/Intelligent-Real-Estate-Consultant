"""Application exceptions. Each maps to one HTTP status and a stable error code.

Messages are written for the person using the panel: they say what happened and never
include internals (SQL, stack traces, tokens).
"""


class AppError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class Unauthorized(AppError):
    status = 401
    code = "unauthorized"


class Forbidden(AppError):
    status = 403
    code = "forbidden"


class NotFound(AppError):
    status = 404
    code = "not_found"


class Conflict(AppError):
    """The request is valid but the current state does not allow it."""

    status = 409
    code = "conflict"


class SendBlocked(Conflict):
    """The send gate refused a message (stop, kill switch, window, cap, ownership)."""

    code = "send_blocked"


class PayloadTooLarge(AppError):
    status = 413
    code = "payload_too_large"


class TooManyRequests(AppError):
    status = 429
    code = "rate_limited"
