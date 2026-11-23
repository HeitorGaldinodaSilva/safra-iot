"""RF08 – controle de acesso por perfil (RBAC).
As sessões ficam na memória do Backend Node; aqui o FastAPI pergunta ao Node
(GET /configuracoes) quem é o dono do token e confere o perfil. Cache de 60 s (RNF10)."""
import hashlib
import time
import unicodedata

import httpx
from fastapi import Depends, Header, HTTPException, Request

from .config import Settings, get_settings

_TTL = 60
_ok: dict[str, tuple[float, str]] = {}   # sha256(token) -> (expira, perfil)


def _normalizar(perfil: str) -> str:
    sem_acento = unicodedata.normalize("NFD", perfil.lower())
    return "".join(c for c in sem_acento if unicodedata.category(c) != "Mn")


def get_http(request: Request) -> httpx.AsyncClient:
    return request.app.state.http


async def _validar(authorization: str | None, cfg: Settings, http: httpx.AsyncClient,
                   permitidos: frozenset[str]) -> None:
    if not cfg.auth_ativa:
        return
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not token:
        raise HTTPException(401, "Sessão ausente. Entre novamente.")

    chave = hashlib.sha256(token.encode()).hexdigest()
    guardado = _ok.get(chave)
    perfil = guardado[1] if guardado and guardado[0] > time.monotonic() else None

    if perfil is None:
        try:
            r = await http.get(f"{cfg.node_api_url}/configuracoes", headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError:
            raise HTTPException(503, "Serviço de autenticação indisponível.")
        if r.status_code == 401:
            raise HTTPException(401, "Sessão expirada. Entre novamente.")
        if r.status_code != 200:
            raise HTTPException(502, f"Falha ao validar a sessão ({r.status_code}).")
        perfil = _normalizar(str((r.json().get("usuario") or {}).get("perfil", "")))
        _ok[chave] = (time.monotonic() + _TTL, perfil)

    if perfil not in permitidos:
        raise HTTPException(403, "Seu perfil não tem acesso a este recurso.")


async def exigir_perfil(authorization: str | None = Header(default=None),
                        cfg: Settings = Depends(get_settings),
                        http: httpx.AsyncClient = Depends(get_http)) -> None:
    """Analista (PERFIS_PERMITIDOS)."""
    await _validar(authorization, cfg, http, cfg.perfis_permitidos)


async def exigir_perfil_produtor(authorization: str | None = Header(default=None),
                                 cfg: Settings = Depends(get_settings),
                                 http: httpx.AsyncClient = Depends(get_http)) -> None:
    """Produtor (PERFIS_PRODUTOR)."""
    await _validar(authorization, cfg, http, cfg.perfis_produtor)


async def exigir_perfil_adm(authorization: str | None = Header(default=None),
                            cfg: Settings = Depends(get_settings),
                            http: httpx.AsyncClient = Depends(get_http)) -> None:
    """Administrador (PERFIS_ADM)."""
    await _validar(authorization, cfg, http, cfg.perfis_adm)
