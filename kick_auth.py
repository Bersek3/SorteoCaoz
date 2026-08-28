import os
import sys
import hmac
import hashlib
import base64
import secrets
import httpx
from urllib.parse import urlencode
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

KICK_CLIENT_ID = os.getenv("KICK_CLIENT_ID", "").strip()
KICK_CLIENT_SECRET = os.getenv("KICK_CLIENT_SECRET", "").strip()
KICK_REDIRECT_URI = os.getenv("KICK_REDIRECT_URI", "http://localhost:8000/api/auth/kick/callback").strip()
KICK_WEBHOOK_SECRET = os.getenv("KICK_WEBHOOK_SECRET", "").strip()

KICK_AUTH_URL = "https://id.kick.com/oauth/authorize"
KICK_TOKEN_URL = "https://id.kick.com/oauth/token"
KICK_USER_API_URL = "https://api.kick.com/public/v1/users"

# In-memory PKCE state cache { state: { code_verifier, created_at } }
pkce_sessions: Dict[str, dict] = {}

def generate_pkce_pair():
    """Genera el par de claves PKCE (code_verifier y code_challenge) para OAuth 2.0."""
    code_verifier = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(hashed).decode("ascii").rstrip("=")
    return code_verifier, code_challenge

def get_kick_authorization_url(state_param: Optional[str] = None) -> tuple[str, str]:
    """Crea la URL de autorización oficial de Kick con PKCE."""
    state = state_param or secrets.token_hex(16)
    code_verifier, code_challenge = generate_pkce_pair()

    pkce_sessions[state] = {
        "code_verifier": code_verifier,
        "created_at": secrets.token_hex(4)
    }

    params = {
        "client_id": KICK_CLIENT_ID or "kick_dev_client_id",
        "redirect_uri": KICK_REDIRECT_URI,
        "response_type": "code",
        "scope": "user:read channel:read channel:subscriptions:read events:subscribe",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256"
    }

    auth_url = f"{KICK_AUTH_URL}?{urlencode(params)}"
    return auth_url, state

async def exchange_kick_code_for_token(code: str, state: str) -> Optional[dict]:
    """Intercambia el código recibido en el callback por el token de acceso de Kick."""
    pkce_data = pkce_sessions.pop(state, None)
    code_verifier = pkce_data["code_verifier"] if pkce_data else None

    # Si estamos en modo de prueba local sin Client ID real configurado, simular respuesta
    if not KICK_CLIENT_ID or KICK_CLIENT_ID.startswith("tu_"):
        print("[Kick OAuth] Usando modo de desarrollo/simulación (Configura KICK_CLIENT_ID en .env para modo producción).")
        return {
            "access_token": f"mock_kick_token_{secrets.token_hex(16)}",
            "token_type": "Bearer",
            "expires_in": 86400,
            "scope": "user:read channel:read",
            "mock": True
        }

    async with httpx.AsyncClient() as client:
        payload = {
            "client_id": KICK_CLIENT_ID,
            "client_secret": KICK_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": KICK_REDIRECT_URI,
        }
        if code_verifier:
            payload["code_verifier"] = code_verifier

        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        try:
            response = await client.post(KICK_TOKEN_URL, data=payload, headers=headers, timeout=10.0)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"[Kick OAuth] Error intercambiando token: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"[Kick OAuth] Excepción en request de token: {e}")
            return None

async def fetch_kick_user_profile(access_token: str) -> Optional[dict]:
    """Obtiene el perfil oficial del usuario de Kick autenticado."""
    if access_token.startswith("mock_"):
        # Retorno de perfil simulado
        return {
            "user_id": f"kick_{secrets.randbelow(90000) + 10000}",
            "name": f"KickUser_{secrets.token_hex(2)}",
            "profile_picture": "https://api.dicebear.com/7.x/bottts/svg?seed=KickUser",
            "email": "user@kick.com"
        }

    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            response = await client.get(KICK_USER_API_URL, headers=headers, timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                # Kick API response: { data: [ { user_id, name, profile_picture, ... } ] }
                if "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
                    return data["data"][0]
                elif "data" in data and isinstance(data["data"], dict):
                    return data["data"]
                return data
            else:
                print(f"[Kick API] Error obteniendo perfil: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"[Kick API] Excepción al consultar perfil: {e}")
            return None

def verify_kick_webhook_signature(signature_header: str, body_bytes: bytes) -> bool:
    """Verifica que el webhook entrante provenga genuinamente de los servidores de Kick."""
    if not KICK_WEBHOOK_SECRET:
        return True # Si no hay secret configurado en dev, aceptar
    
    expected_sig = hmac.new(KICK_WEBHOOK_SECRET.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig, signature_header)
