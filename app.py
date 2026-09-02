import os
import sys
import json
import random
import asyncio
import httpx
from datetime import datetime
from typing import Dict, List, Optional, Any

# Asegurar codificación UTF-8 en Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from dotenv import load_dotenv
load_dotenv()

from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Response, Depends, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

# Módulos de Supabase, Kick OAuth y Live Listener
from supabase_db import db
from kick_auth import (
    get_kick_authorization_url,
    exchange_kick_code_for_token,
    fetch_kick_user_profile,
    verify_kick_webhook_signature,
    KICK_CLIENT_ID
)
from kick_live_listener import KickLiveListener

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
os.makedirs(PUBLIC_DIR, exist_ok=True)

app = FastAPI(
    title="Kick PS5 Raffle - Production Ready",
    version="3.0.0",
    description="Sistema de sorteo PS5 estilo sala de cine con Kick OAuth 2.0 y Supabase Database."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------
# Verificación de Roles y Seguridad (Dueño del Canal / Moderadores)
# ---------------------------------------------------------------------
def check_user_role(username: Optional[str]) -> dict:
    """Verifica si el usuario es el dueño del canal, moderador o espectador común."""
    if not username:
        return {
            "is_logged_in": False,
            "is_admin": False,
            "is_streamer": False,
            "is_moderator": False,
            "role": "guest"
        }

    load_dotenv(override=True)
    channel_owner = os.getenv("KICK_CHANNEL_SLUG", "Caoz").strip().lower()
    mods_env = os.getenv("KICK_MODERATORS", "").strip().lower()
    moderators = [m.strip() for m in mods_env.split(",") if m.strip()]

    u_clean = username.strip().lower()
    is_owner = (u_clean == channel_owner)
    is_mod = (u_clean in moderators)
    is_admin = is_owner or is_mod

    return {
        "is_logged_in": True,
        "is_admin": is_admin,
        "is_streamer": is_owner,
        "is_moderator": is_mod,
        "role": "streamer" if is_owner else ("moderator" if is_mod else "viewer")
    }

def require_admin(request: Request) -> str:
    """Valida que la petición provenga exclusivamente del streamer o un moderador."""
    username = request.cookies.get("kick_user") or request.headers.get("X-Kick-User")
    role = check_user_role(username)
    if not role["is_admin"]:
        raise HTTPException(
            status_code=403, 
            detail="Acceso restringido: Solo el dueño del canal (@" + os.getenv("KICK_CHANNEL_SLUG", "Caoz") + ") o moderadores pueden realizar esta acción."
        )
    return username

# ---------------------------------------------------------------------
# WebSocket Connection Manager
# ---------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# ---------------------------------------------------------------------
# Modelos de Datos
# ---------------------------------------------------------------------
class SeatSelectRequest(BaseModel):
    seat_numbers: List[int]
    username: Optional[str] = None

class AutoPickRequest(BaseModel):
    count: Optional[int] = None
    username: Optional[str] = None

class AddTicketsRequest(BaseModel):
    username: str
    own_subs: Optional[int] = None
    gifted_subs: Optional[int] = None
    bonus_tickets: Optional[int] = None

class SimulateEventRequest(BaseModel):
    username: str
    event_type: str
    count: Optional[int] = 1

class ConfigRequest(BaseModel):
    title: Optional[str] = None
    prize: Optional[str] = None
    channel: Optional[str] = None
    total_seats: Optional[int] = None
    is_locked: Optional[bool] = None

class DrawRequest(BaseModel):
    method: Optional[str] = "random"

# ---------------------------------------------------------------------
# Rutas de Autenticación Kick OAuth 2.0 (PKCE)
# ---------------------------------------------------------------------
@app.get("/api/auth/kick/login")
async def kick_oauth_login(custom_username: Optional[str] = None):
    """Inicia el flujo oficial de OAuth 2.0 con Kick.com."""
    # Acceso rápido en desarrollo local
    if custom_username:
        user = await db.get_or_create_user(
            kick_user_id=f"kick_{abs(hash(custom_username)) % 100000}",
            username=custom_username,
            display_name=custom_username,
            is_streamer=(custom_username.strip().lower() == os.getenv("KICK_CHANNEL_SLUG", "Caoz").strip().lower())
        )
        response = RedirectResponse(url="/")
        response.set_cookie(key="kick_user", value=user["username"], max_age=86400*30, httponly=False)
        return response

    auth_url, state = get_kick_authorization_url()
    return RedirectResponse(url=auth_url)

@app.get("/api/auth/kick/callback")
async def kick_oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Callback donde Kick devuelve el token tras autorizar en id.kick.com."""
    if error:
        return RedirectResponse(url=f"/?auth_error={error}")
    if not code or not state:
        return RedirectResponse(url="/?auth_error=missing_params")

    # Intercambiar código por Token
    token_data = await exchange_kick_code_for_token(code, state)
    if not token_data or "access_token" not in token_data:
        return RedirectResponse(url="/?auth_error=token_exchange_failed")

    # Obtener perfil oficial desde la API de Kick
    profile = await fetch_kick_user_profile(token_data["access_token"])
    if not profile:
        return RedirectResponse(url="/?auth_error=profile_fetch_failed")

    kick_user_id = str(profile.get("user_id", profile.get("id", "")))
    username = profile.get("name", profile.get("username", "KickUser"))
    avatar_url = profile.get("profile_picture", f"https://api.dicebear.com/7.x/bottts/svg?seed={username}")

    channel_slug = os.getenv("KICK_CHANNEL_SLUG", "Caoz").strip().lower()
    is_owner = (username.strip().lower() == channel_slug)

    # Guardar en Supabase
    user = await db.get_or_create_user(
        kick_user_id=kick_user_id,
        username=username,
        display_name=username,
        avatar_url=avatar_url,
        is_streamer=is_owner
    )

    response = RedirectResponse(url="/")
    response.set_cookie(key="kick_user", value=username, max_age=86400*30, httponly=False)
    return response

@app.get("/api/auth/logout")
async def logout():
    """Cierra la sesión del usuario."""
    response = RedirectResponse(url="/")
    response.delete_cookie("kick_user")
    return response

# ---------------------------------------------------------------------
# Estado Principal del Sorteo (Público & Protegido por Rol)
# ---------------------------------------------------------------------
@app.get("/api/state")
async def get_state(req: Request, username: Optional[str] = None):
    """Devuelve el estado completo del sorteo adaptado al rol del usuario."""
    async with db.lock:
        cookie_user = req.cookies.get("kick_user")
        current_username = cookie_user or username

        role_info = check_user_role(current_username)
        config = await db.get_config()
        seats = await db.get_all_seats()

        user_data = None
        used_tickets = 0
        available_tickets = 0
        user_seats = []

        if current_username:
            user_data = await db.get_user_by_username(current_username)
            used_tickets = await db.get_user_used_tickets(current_username)
            available_tickets = max(0, user_data.get("total_tickets", 0) - used_tickets)
            user_seats = [
                seat["seat_number"] for seat in seats.values()
                if seat["username"].lower() == current_username.lower()
            ]

        occupied_count = len(seats)
        total_seats = config.get("total_seats", 200)

        all_users = await db.get_all_users_list() if role_info["is_admin"] else []

        return {
            "config": config,
            "has_supabase": db.use_supabase,
            "has_kick_oauth": bool(KICK_CLIENT_ID and not KICK_CLIENT_ID.startswith("tu_")),
            "role": role_info,
            "stats": {
                "total_seats": total_seats,
                "occupied_seats": occupied_count,
                "available_seats": max(0, total_seats - occupied_count),
                "occupancy_percent": round((occupied_count / total_seats) * 100, 1) if total_seats > 0 else 0,
                "total_participants": len(set(s["username"] for s in seats.values()))
            },
            "user": {
                **(user_data or {
                    "username": None,
                    "display_name": "Invitado",
                    "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=Guest",
                    "total_tickets": 0,
                    "own_subs": 0,
                    "gifted_subs": 0
                }),
                **role_info,
                "used_tickets": used_tickets,
                "available_tickets": available_tickets,
                "my_seats": sorted(user_seats)
            },
            "seats": seats,
            "winner": db.local_cache.get("winner"),
            "all_users_list": all_users
        }

# ---------------------------------------------------------------------
# Selección de Asientos (Pública para usuarios autenticados)
# ---------------------------------------------------------------------
@app.post("/api/seats/toggle")
async def toggle_seat_endpoint(request: SeatSelectRequest, req: Request):
    """Reclama o libera un asiento en Supabase para el usuario en sesión."""
    async with db.lock:
        config = await db.get_config()
        if config.get("is_locked", False):
            raise HTTPException(status_code=400, detail="La sala de selección está bloqueada por el streamer.")

        current_username = req.cookies.get("kick_user") or request.username
        if not current_username:
            raise HTTPException(status_code=401, detail="Debes iniciar sesión con Kick para reservar un asiento.")

        updated_seats = []
        for seat_num in request.seat_numbers:
            if seat_num < 1 or seat_num > config.get("total_seats", 200):
                raise HTTPException(status_code=400, detail=f"Asiento #{seat_num} fuera de rango.")

            try:
                res = await db.toggle_seat(current_username, seat_num)
                updated_seats.append(res)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

        all_seats = await db.get_all_seats()
        await manager.broadcast({
            "type": "SEATS_UPDATED",
            "seats": all_seats,
            "action": "toggle",
            "username": current_username,
            "updated": updated_seats
        })

        return {
            "success": True,
            "message": "Asiento actualizado exitosamente",
            "available_tickets": await db.get_user_available_tickets(current_username)
        }

@app.post("/api/seats/auto-pick")
async def auto_pick_endpoint(request: AutoPickRequest, req: Request):
    """Auto-asignación de números al azar."""
    async with db.lock:
        config = await db.get_config()
        if config.get("is_locked", False):
            raise HTTPException(status_code=400, detail="La sala está bloqueada temporalmente.")

        current_username = req.cookies.get("kick_user") or request.username
        if not current_username:
            raise HTTPException(status_code=401, detail="Debes iniciar sesión con Kick para auto-asignar.")

        try:
            chosen = await db.auto_pick(current_username, request.count)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        all_seats = await db.get_all_seats()
        await manager.broadcast({
            "type": "SEATS_UPDATED",
            "seats": all_seats,
            "action": "auto_pick",
            "username": current_username,
            "assigned_seats": chosen
        })

        return {
            "success": True,
            "assigned_seats": chosen,
            "message": f"¡Se han asignado {len(chosen)} números de la suerte a @{current_username}!"
        }

# ---------------------------------------------------------------------
# Endpoints de Administración (PROTEGIDOS: Solo Streamer / Moderadores)
# ---------------------------------------------------------------------
@app.post("/api/admin/config")
async def update_config_endpoint(request: ConfigRequest, req: Request):
    """Actualiza la configuración del sorteo (Solo Streamer / Mods)."""
    require_admin(req)
    async with db.lock:
        updates = {}
        if request.title is not None: updates["title"] = request.title
        if request.prize is not None: updates["prize"] = request.prize
        if request.channel is not None: updates["channel"] = request.channel
        if request.total_seats is not None: updates["total_seats"] = max(10, min(2000, request.total_seats))
        if request.is_locked is not None: updates["is_locked"] = request.is_locked

        new_config = await db.update_config(updates)
        all_seats = await db.get_all_seats()

        await manager.broadcast({
            "type": "CONFIG_UPDATED",
            "config": new_config,
            "seats": all_seats
        })

        return {"success": True, "config": new_config}

@app.post("/api/admin/simulate-event")
async def admin_simulate_event(request: SimulateEventRequest, req: Request):
    """Simulador de eventos manuales (Solo Streamer / Mods)."""
    require_admin(req)
    async with db.lock:
        username = request.username.strip()
        user = await db.record_kick_event(
            username=username,
            event_type=request.event_type,
            count=request.count or 1
        )

        event_label = f"🎁 @{username} regaló {request.count} subs en Kick (+{request.count} Tickets)" if (request.count or 1) > 1 else f"⭐ @{username} se suscribió (+1 Ticket)"

        await manager.broadcast({
            "type": "KICK_EVENT",
            "event": {
                "username": username,
                "avatar": user["avatar"],
                "label": event_label,
                "tickets_added": request.count or 1,
                "total_tickets": user["total_tickets"],
                "timestamp": datetime.now().isoformat()
            }
        })

        return {"success": True, "message": event_label, "user": user}

@app.post("/api/giveaway/draw")
async def draw_winner_endpoint(request: DrawRequest, req: Request):
    """Ejecuta el sorteo oficial y persiste al ganador en Supabase (Solo Streamer / Mods)."""
    require_admin(req)
    async with db.lock:
        seats = await db.get_all_seats()
        occupied_seats = list(seats.values())

        if not occupied_seats:
            raise HTTPException(status_code=400, detail="No hay asientos ocupados en la sala para sortear.")

        winning_seat = random.choice(occupied_seats)
        winner_username = winning_seat["username"]
        winner_user = await db.get_user_by_username(winner_username)
        config = await db.get_config()

        total_occupied = len(occupied_seats)
        user_tickets_count = sum(1 for s in occupied_seats if s["username"].lower() == winner_username.lower())
        win_probability = round((user_tickets_count / total_occupied) * 100, 2)

        winner_data = {
            "seat_number": winning_seat["seat_number"],
            "username": winner_username,
            "display_name": winner_user.get("display_name", winner_username),
            "avatar": winner_user.get("avatar", f"https://api.dicebear.com/7.x/bottts/svg?seed={winner_username}"),
            "claimed_at": winning_seat.get("claimed_at"),
            "user_total_tickets": user_tickets_count,
            "win_probability": win_probability,
            "prize": config.get("prize", "PlayStation 5 Slim"),
            "drawn_at": datetime.now().isoformat()
        }

        await db.save_winner(winner_data)

        await manager.broadcast({
            "type": "DRAW_COMPLETED",
            "winner": winner_data,
            "candidate_seats": [s["seat_number"] for s in occupied_seats]
        })

        return {
            "success": True,
            "winner": winner_data,
            "candidate_seats": [s["seat_number"] for s in occupied_seats]
        }

@app.post("/api/admin/reset")
async def reset_giveaway_endpoint(req: Request, clear_users: bool = Query(False)):
    """Reinicia la sala (Solo Streamer / Mods)."""
    require_admin(req)
    async with db.lock:
        await db.reset_giveaway(clear_users)
        await manager.broadcast({
            "type": "GIVEAWAY_RESET",
            "seats": {},
            "winner": None
        })
        return {"success": True, "message": "Sala reiniciada exitosamente."}

# ---------------------------------------------------------------------
# Webhooks de Kick y BotRix
# ---------------------------------------------------------------------
@app.post("/api/webhooks/kick")
async def kick_webhook_receiver(request: Request):
    body_bytes = await request.body()
    signature = request.headers.get("Kick-Event-Signature", "")

    if not verify_kick_webhook_signature(signature, body_bytes):
        raise HTTPException(status_code=401, detail="Firma inválida.")

    payload = json.loads(body_bytes.decode("utf-8"))
    event_type = payload.get("event", "subscription.new")
    event_data = payload.get("data", {})
    username = event_data.get("username", event_data.get("gifter_username", "Anonimo"))
    count = int(event_data.get("gift_count", 1))

    user = await db.record_kick_event(username=username, event_type=event_type, count=count, raw_payload=payload)
    label = f"🎁 @{username} regaló {count} subs (+{count} Tickets)" if count > 1 else f"⭐ @{username} se suscribió (+1 Ticket)"

    await manager.broadcast({
        "type": "KICK_EVENT",
        "event": {
            "username": username,
            "avatar": user["avatar"],
            "label": label,
            "tickets_added": count,
            "total_tickets": user["total_tickets"],
            "timestamp": datetime.now().isoformat()
        }
    })
    return {"status": "success"}

@app.post("/api/botrix/webhook")
async def botrix_webhook_receiver(request: Request):
    payload = await request.json()
    username = payload.get("user") or payload.get("username") or payload.get("name", "Anonimo")
    event_type = payload.get("type", "sub")
    amount = int(payload.get("amount", payload.get("count", 1)))

    user = await db.record_kick_event(
        username=username,
        event_type="gift_sub" if amount > 1 or "gift" in str(event_type) else "sub",
        count=amount,
        raw_payload=payload
    )

    label = f"🎁 @{username} regaló {amount} subs (vía BotRix) (+{amount} Tickets)" if amount > 1 else f"⭐ @{username} se suscribió (vía BotRix) (+1 Ticket)"

    await manager.broadcast({
        "type": "KICK_EVENT",
        "event": {
            "username": username,
            "avatar": user["avatar"],
            "label": label,
            "tickets_added": amount,
            "total_tickets": user["total_tickets"],
            "timestamp": datetime.now().isoformat()
        }
    })
    return {"success": True}

# ---------------------------------------------------------------------
# Vistas Web & Widgets OBS
# ---------------------------------------------------------------------
if os.path.exists(os.path.join(PUBLIC_DIR, "css")):
    app.mount("/css", StaticFiles(directory=os.path.join(PUBLIC_DIR, "css")), name="css")
if os.path.exists(os.path.join(PUBLIC_DIR, "js")):
    app.mount("/js", StaticFiles(directory=os.path.join(PUBLIC_DIR, "js")), name="js")
if os.path.exists(os.path.join(PUBLIC_DIR, "images")):
    app.mount("/images", StaticFiles(directory=os.path.join(PUBLIC_DIR, "images")), name="images")
if os.path.exists(os.path.join(PUBLIC_DIR, "fonts")):
    app.mount("/fonts", StaticFiles(directory=os.path.join(PUBLIC_DIR, "fonts")), name="fonts")
if os.path.exists(os.path.join(PUBLIC_DIR, "video")):
    app.mount("/video", StaticFiles(directory=os.path.join(PUBLIC_DIR, "video")), name="video")
app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(PUBLIC_DIR, "index.html"))

@app.get("/admin")
async def serve_admin(req: Request):
    """Página de administración protegida."""
    cookie_user = req.cookies.get("kick_user")
    role = check_user_role(cookie_user)
    if not role["is_admin"]:
        # Si no es admin, redirigir al inicio
        return RedirectResponse(url="/?error=unauthorized_admin")
    return FileResponse(os.path.join(PUBLIC_DIR, "admin.html"))

@app.get("/draw")
async def serve_draw():
    return FileResponse(os.path.join(PUBLIC_DIR, "draw.html"))

@app.get("/widget/alert")
async def serve_widget_alert():
    return FileResponse(os.path.join(PUBLIC_DIR, "widget-alert.html"))

@app.get("/widget/cinema")
async def serve_widget_cinema():
    return FileResponse(os.path.join(PUBLIC_DIR, "widget-cinema.html"))

@app.get("/widget/bar")
async def serve_widget_bar():
    return FileResponse(os.path.join(PUBLIC_DIR, "widget-bar.html"))

# ---------------------------------------------------------------------
# Inicio con Kick Pusher en Vivo
# ---------------------------------------------------------------------
async def on_kick_live_event(username: str, event_type: str, count: int, raw_data: dict):
    user = await db.record_kick_event(
        username=username,
        event_type=event_type,
        count=count,
        raw_payload=raw_data
    )
    label = f"🎁 @{username} regaló {count} suscripciones en Kick (+{count} Tickets)" if count > 1 else f"⭐ @{username} se suscribió en Kick (+1 Ticket)"

    await manager.broadcast({
        "type": "KICK_EVENT",
        "event": {
            "username": username,
            "avatar": user["avatar"],
            "label": label,
            "tickets_added": count,
            "total_tickets": user["total_tickets"],
            "timestamp": datetime.now().isoformat()
        }
    })

async def keep_alive_ping():
    """Mantiene despierto el servicio en Render evitando que se duerma tras 15 min de inactividad."""
    await asyncio.sleep(45)
    render_url = os.getenv("RENDER_EXTERNAL_URL", "https://sorteocaoz.onrender.com").rstrip("/")
    while True:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{render_url}/", timeout=12.0)
                print(f"[⏱️ Keep-Alive] Ping a {render_url}: {resp.status_code}")
        except Exception as e:
            print(f"[⏱️ Keep-Alive] Ping local: {e}")
        await asyncio.sleep(480) # Ping cada 8 minutos

@app.on_event("startup")
async def startup_event():
    channel_slug = os.getenv("KICK_CHANNEL_SLUG", "Caoz")
    listener = KickLiveListener(channel_slug, on_event_callback=on_kick_live_event)
    asyncio.create_task(listener.start())
    asyncio.create_task(keep_alive_ping())
    print(f"[*] Sistema de Sorteo PS5 Kick listo para el canal @{channel_slug} (Keep-Alive activo)")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
