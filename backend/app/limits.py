"""Global request body ceiling, including chunked bodies without Content-Length."""

from fastapi import HTTPException
from starlette.responses import JSONResponse

JSON_LIMIT = 1024 * 1024


class BodyLimit:
    def __init__(self, app, upload_limit, limit=JSON_LIMIT):
        self.app, self.limit, self.upload_limit = app, limit, upload_limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        maximum = self.upload_limit if scope["path"].endswith("/attachments") else self.limit
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None:
            try:
                too_large = int(declared) > maximum
            except ValueError:
                too_large = True
            if too_large:
                response = JSONResponse({"detail": "Requisição maior que o permitido"}, 413)
                await response(scope, receive, send)
                return
        received = 0

        async def limited():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > maximum:
                    raise HTTPException(413, "Requisição maior que o permitido")
            return message

        await self.app(scope, limited, send)
