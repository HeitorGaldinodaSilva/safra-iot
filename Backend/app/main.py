from contextlib import asynccontextmanager

from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .routers import adm, analista, colheita, leituras, modelos, produtor


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as http:
        app.state.http = http
        yield


app = FastAPI(title="Safra API", version="0.1.0", lifespan=lifespan,
              description="Dashboard Analista > Inicial: ThingSpeak (sensor ESP32) x INMET (estação oficial).")

_cfg = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_cfg.cors_origins),
    allow_origin_regex=None if _cfg.cors_origins else r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"],
)
app.include_router(analista.router)
app.include_router(modelos.router)
app.include_router(colheita.router)
app.include_router(produtor.router)
app.include_router(adm.router)
app.include_router(leituras.router)


@app.get("/saude", tags=["Infra"])
async def saude():
    return {"status": "ok"}


# Dashboard/PWA de monitoramento (Frontend/Monitor) servido em /monitor/
_monitor = Path(__file__).resolve().parents[2] / "Frontend" / "Monitor"
if _monitor.is_dir():
    app.mount("/monitor", StaticFiles(directory=_monitor, html=True), name="monitor")
