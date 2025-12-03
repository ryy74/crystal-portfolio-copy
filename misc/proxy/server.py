import os
import logging
from typing import Iterable, Tuple
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse, JSONResponse, PlainTextResponse

UPSTREAM_BASE = os.getenv("UPSTREAM_BASE", "https://pro.edgex.exchange").rstrip("/")
LOG_LEVEL = os.getenv("LOG_LEVEL", "info").upper()

allow_origins_env = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "https://crystal.exchange,https://test.crystal.exchange,http://localhost:5173,http://127.0.0.1:3000",
)
ALLOW_ORIGINS = [o.strip() for o in allow_origins_env.split(",") if o.strip()]

ALLOW_METHODS = [m.strip().upper() for m in os.getenv(
    "CORS_ALLOW_METHODS",
    "GET,POST,PUT,DELETE,OPTIONS,PATCH"
).split(",") if m.strip()]

ALLOW_CREDENTIALS = os.getenv("CORS_ALLOW_CREDENTIALS", "true").lower() == "true"

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger("proxy")

HOP_BY_HOP_REQUEST = {
    "connection",
    "proxy-connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
    "proxy-authenticate",
    "proxy-authorization",
    "content-length",
    "host",
    "cookie",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-dest",
    "sec-fetch-user",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-real-ip",
    "x-vercel-ip-country",
    "x-vercel-deployment-url",
    "x-vercel-id",
    "forwarded",
}

HOP_BY_HOP_RESPONSE = {
    "connection",
    "proxy-connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
    "alt-svc",
    "content-encoding",
}

app = FastAPI(title="Crystal Proxy", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=ALLOW_METHODS,
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

client = httpx.AsyncClient(
    base_url=UPSTREAM_BASE,
    timeout=httpx.Timeout(20.0, read=60.0),
    follow_redirects=False,
)

def cleanse_query(raw_qs: str) -> str:
    if not raw_qs:
        return ""
    from urllib.parse import parse_qsl
    pairs = []
    for k, v in parse_qsl(raw_qs, keep_blank_values=True):
        if k == "path":
            continue
        if k.startswith("nxt"):
            continue
        if k.startswith("__vercel"):
            continue
        pairs.append((k, v))
    return urlencode(pairs, doseq=True)

def build_target_path(fullpath: str, raw_url: str) -> Tuple[str, str]:
    rel = fullpath if fullpath.startswith("/") else "/" + fullpath
    if rel.startswith("/api/proxy"):
        rel = rel[len("/api/proxy"):] or "/"
    split = urlsplit(raw_url)
    clean_qs = cleanse_query(split.query)
    return rel, clean_qs

def filter_request_headers(headers: Iterable[Tuple[str, str]]) -> httpx.Headers:
    out = httpx.Headers()
    for k, v in headers:
        lk = k.lower()
        if lk in HOP_BY_HOP_REQUEST:
            continue
        out[k] = v
    return out

def filter_response_headers(headers: httpx.Headers) -> httpx.Headers:
    out = httpx.Headers()
    for k, v in headers.items():
        if k.lower() in HOP_BY_HOP_RESPONSE:
            continue
        out[k] = v
    return out

async def forward_to_upstream(rel_path: str, request: Request) -> Response:
    clean_qs = cleanse_query(urlsplit(str(request.url)).query)
    target_url = rel_path if not clean_qs else f"{rel_path}?{clean_qs}"

    fwd_headers = filter_request_headers(request.headers.items())

    body = None
    if request.method not in ("GET", "HEAD"):
        body = await request.body()

    try:
        upstream = await client.request(
            request.method,
            target_url,
            headers=fwd_headers,
            content=body,
        )
    except httpx.TimeoutException:
        return JSONResponse({"error": "upstream timeout"}, status_code=504)
    except Exception as e:
        logger.exception("proxy error")
        return JSONResponse({"error": str(e)}, status_code=500)

    resp_headers = filter_response_headers(upstream.headers)

    return StreamingResponse(
        upstream.aiter_bytes(),
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
        background=None,
    )

@app.options("/api/proxy/{fullpath:path}")
async def preflight_proxy(fullpath: str, request: Request) -> Response:
    return Response(status_code=204)

@app.api_route("/api/proxy/{fullpath:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(fullpath: str, request: Request):
    rel_path, _ = build_target_path(fullpath, str(request.url))
    return await forward_to_upstream(rel_path, request)

@app.options("/api/v1/{rest:path}")
async def preflight_direct(rest: str, request: Request) -> Response:
    return Response(status_code=204)

@app.api_route("/api/v1/{rest:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_direct(rest: str, request: Request):
    rel_path = f"/api/v1/{rest}"
    return await forward_to_upstream(rel_path, request)

@app.get("/healthz")
async def healthz():
    return PlainTextResponse("ok")

@app.on_event("shutdown")
async def shutdown_event():
    await client.aclose()