"""Las webs de Doganiero se abren como antes. Google no las indexa."""
from starlette.responses import Response

_ROBOTS = b"User-agent: *\nDisallow: /\n"


def install(app):
    @app.middleware("http")
    async def _quiet(request, call_next):
        path = request.scope.get("path") or "/"
        if path == "/robots.txt":
            return Response(content=_ROBOTS, media_type="text/plain", headers={"X-Robots-Tag": "noindex, nofollow"})
        resp = await call_next(request)
        resp.headers["X-Robots-Tag"] = "noindex, nofollow"
        return resp
