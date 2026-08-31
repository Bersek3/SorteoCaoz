import os
import json
import random
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()

has_supabase = bool(SUPABASE_URL and SUPABASE_KEY and not SUPABASE_URL.startswith("tu_") and "supabase.co" in SUPABASE_URL)

supabase_client = None
if has_supabase:
    try:
        from supabase import create_client, Client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"[*] Conectado exitosamente a Supabase Database: {SUPABASE_URL}")
    except Exception as e:
        print(f"[!] Error conectando a Supabase SDK: {e}. Usando almacenamiento persistente local de respaldo.")
        has_supabase = False

LOCAL_DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "giveaway_data.json")

class SupabaseDataLayer:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.use_supabase = has_supabase and supabase_client is not None
        self.supabase = supabase_client
        self.local_cache = self._load_local_data()

    def _load_local_data(self) -> dict:
        if os.path.exists(LOCAL_DATA_FILE):
            try:
                with open(LOCAL_DATA_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "config": {
                "title": "Sorteo Oficial PlayStation 5 🎮",
                "prize": "PlayStation 5 Slim (Edición Disco)",
                "channel": os.getenv("KICK_CHANNEL_SLUG", "Caoz"),
                "total_seats": 200,
                "is_locked": False,
                "created_at": datetime.now().isoformat()
            },
            "users": {},
            "seats": {},
            "winner": None,
            "draw_history": []
        }

    def _save_local(self):
        try:
            os.makedirs(os.path.dirname(LOCAL_DATA_FILE), exist_ok=True)
            with open(LOCAL_DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(self.local_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[DB] Error guardando cache local: {e}")

    # -----------------------------------------------------------------
    # CONFIGURACIÓN DEL SORTEO
    # -----------------------------------------------------------------
    async def get_config(self) -> dict:
        if self.use_supabase:
            try:
                res = self.supabase.table("giveaway_config").select("*").eq("id", "current").execute()
                if res.data and len(res.data) > 0:
                    c = res.data[0]
                    return {
                        "title": c.get("title", "Sorteo PlayStation 5"),
                        "prize": c.get("prize", "PlayStation 5 Slim"),
                        "channel": c.get("channel_slug", "Caoz"),
                        "total_seats": c.get("total_seats", 200),
                        "is_locked": c.get("is_locked", False),
                        "updated_at": c.get("updated_at")
                    }
            except Exception as e:
                print(f"[Supabase] Error en get_config: {e}")
        return self.local_cache["config"]

    async def update_config(self, updates: dict) -> dict:
        if self.use_supabase:
            try:
                db_updates = {}
                if "title" in updates: db_updates["title"] = updates["title"]
                if "prize" in updates: db_updates["prize"] = updates["prize"]
                if "channel" in updates: db_updates["channel_slug"] = updates["channel"]
                if "total_seats" in updates: db_updates["total_seats"] = updates["total_seats"]
                if "is_locked" in updates: db_updates["is_locked"] = updates["is_locked"]
                db_updates["updated_at"] = datetime.now().isoformat()

                self.supabase.table("giveaway_config").upsert({"id": "current", **db_updates}).execute()
            except Exception as e:
                print(f"[Supabase] Error en update_config: {e}")

        # Mantener en local
        self.local_cache["config"].update(updates)
        self._save_local()
        return self.local_cache["config"]

    # -----------------------------------------------------------------
    # GESTIÓN DE PERFILES DE KICK
    # -----------------------------------------------------------------
    async def get_or_create_user(
        self, 
        kick_user_id: str, 
        username: str, 
        display_name: Optional[str] = None, 
        avatar_url: Optional[str] = None,
        is_streamer: bool = False
    ) -> dict:
        clean_user = username.strip()
        avatar = avatar_url or f"https://api.dicebear.com/7.x/bottts/svg?seed={clean_user}"
        d_name = display_name or clean_user

        if self.use_supabase:
            try:
                # Buscar por kick_user_id o username
                res = self.supabase.table("profiles").select("*").or_(f"kick_user_id.eq.{kick_user_id},username.eq.{clean_user}").execute()
                if res.data and len(res.data) > 0:
                    u = res.data[0]
                    # Actualizar avatar o display_name si cambiaron
                    self.supabase.table("profiles").update({
                        "username": clean_user,
                        "display_name": d_name,
                        "avatar_url": avatar,
                        "updated_at": datetime.now().isoformat()
                    }).eq("id", u["id"]).execute()
                    
                    return {
                        "id": u["id"],
                        "kick_user_id": u.get("kick_user_id", kick_user_id),
                        "username": clean_user,
                        "display_name": d_name,
                        "avatar": avatar,
                        "is_streamer": u.get("is_streamer", False),
                        "own_subs": u.get("own_subs", 0),
                        "gifted_subs": u.get("gifted_subs", 0),
                        "bonus_tickets": u.get("bonus_tickets", 0),
                        "total_tickets": u.get("total_tickets", (u.get("own_subs",0) + u.get("gifted_subs",0) + u.get("bonus_tickets",0)))
                    }
                else:
                    # Crear nuevo en Supabase
                    new_rec = {
                        "kick_user_id": str(kick_user_id),
                        "username": clean_user,
                        "display_name": d_name,
                        "avatar_url": avatar,
                        "is_streamer": is_streamer,
                        "own_subs": 0,
                        "gifted_subs": 0,
                        "bonus_tickets": 0
                    }
                    insert_res = self.supabase.table("profiles").insert(new_rec).execute()
                    if insert_res.data:
                        u = insert_res.data[0]
                        return {
                            "id": u["id"],
                            "kick_user_id": kick_user_id,
                            "username": clean_user,
                            "display_name": d_name,
                            "avatar": avatar,
                            "is_streamer": is_streamer,
                            "own_subs": 0,
                            "gifted_subs": 0,
                            "bonus_tickets": 0,
                            "total_tickets": 0
                        }
            except Exception as e:
                print(f"[Supabase] Error en get_or_create_user: {e}")

        # Fallback Local
        if clean_user not in self.local_cache["users"]:
            self.local_cache["users"][clean_user] = {
                "id": f"usr_{abs(hash(clean_user)) % 100000}",
                "kick_user_id": str(kick_user_id),
                "username": clean_user,
                "display_name": d_name,
                "avatar": avatar,
                "is_streamer": is_streamer,
                "own_subs": 0,
                "gifted_subs": 0,
                "bonus_tickets": 0,
                "total_tickets": 0
            }
            self._save_local()
        return self.local_cache["users"][clean_user]

    async def get_user_by_username(self, username: str) -> dict:
        clean = username.strip()
        if self.use_supabase:
            try:
                res = self.supabase.table("profiles").select("*").ilike("username", clean).execute()
                if res.data and len(res.data) > 0:
                    u = res.data[0]
                    total = u.get("total_tickets")
                    if total is None:
                        total = u.get("own_subs", 0) + u.get("gifted_subs", 0) + u.get("bonus_tickets", 0)
                    return {
                        "id": u["id"],
                        "kick_user_id": u.get("kick_user_id", ""),
                        "username": u["username"],
                        "display_name": u.get("display_name", u["username"]),
                        "avatar": u.get("avatar_url", f"https://api.dicebear.com/7.x/bottts/svg?seed={clean}"),
                        "is_streamer": u.get("is_streamer", False),
                        "own_subs": u.get("own_subs", 0),
                        "gifted_subs": u.get("gifted_subs", 0),
                        "bonus_tickets": u.get("bonus_tickets", 0),
                        "total_tickets": total
                    }
            except Exception as e:
                print(f"[Supabase] Error get_user_by_username: {e}")

        # Local
        if clean not in self.local_cache["users"]:
            return await self.get_or_create_user(str(abs(hash(clean)) % 10000), clean)
        return self.local_cache["users"][clean]

    # -----------------------------------------------------------------
    # ASIENTOS DE CINE (SEATS)
    # -----------------------------------------------------------------
    async def get_all_seats(self) -> Dict[str, dict]:
        if self.use_supabase:
            try:
                res = self.supabase.table("seats").select("*").execute()
                seats_map = {}
                for row in res.data:
                    seats_map[str(row["seat_number"])] = {
                        "seat_number": row["seat_number"],
                        "username": row["username"],
                        "avatar": row.get("avatar_url", f"https://api.dicebear.com/7.x/bottts/svg?seed={row['username']}"),
                        "claimed_at": row.get("claimed_at")
                    }
                return seats_map
            except Exception as e:
                print(f"[Supabase] Error get_all_seats: {e}")
        return self.local_cache.get("seats", {})

    async def get_user_used_tickets(self, username: str) -> int:
        seats = await self.get_all_seats()
        return sum(1 for s in seats.values() if s["username"] == username)

    async def get_user_available_tickets(self, username: str) -> int:
        user = await self.get_user_by_username(username)
        total = user.get("total_tickets", 0)
        used = await self.get_user_used_tickets(username)
        return max(0, total - used)

    async def toggle_seat(self, username: str, seat_number: int) -> dict:
        user = await self.get_user_by_username(username)
        seats = await self.get_all_seats()
        seat_key = str(seat_number)

        # Caso 1: El asiento es del usuario -> Liberarlo
        if seat_key in seats and seats[seat_key]["username"] == username:
            if self.use_supabase:
                try:
                    self.supabase.table("seats").delete().eq("seat_number", seat_number).execute()
                except Exception as e:
                    print(f"[Supabase] Error liberando asiento: {e}")
            if seat_key in self.local_cache["seats"]:
                del self.local_cache["seats"][seat_key]
                self._save_local()
            return {"status": "freed", "seat_number": seat_number}

        # Caso 2: El asiento está ocupado por otra persona
        elif seat_key in seats:
            owner = seats[seat_key]["username"]
            raise ValueError(f"El asiento #{seat_number} ya fue reservado por @{owner}.")

        # Caso 3: Asiento libre -> Reservar
        else:
            available = await self.get_user_available_tickets(username)
            if available <= 0:
                raise ValueError(f"No tienes tickets disponibles. (Total: {user.get('total_tickets', 0)}).")

            avatar = user.get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={username}"
            claimed_at = datetime.now().isoformat()

            if self.use_supabase:
                try:
                    self.supabase.table("seats").insert({
                        "seat_number": seat_number,
                        "username": username,
                        "avatar_url": avatar,
                        "claimed_at": claimed_at
                    }).execute()
                except Exception as e:
                    print(f"[Supabase] Error reservando asiento: {e}")

            self.local_cache["seats"][seat_key] = {
                "seat_number": seat_number,
                "username": username,
                "avatar": avatar,
                "claimed_at": claimed_at
            }
            self._save_local()
            return {"status": "claimed", "seat_number": seat_number}

    async def auto_pick(self, username: str, count: Optional[int] = None) -> List[int]:
        user = await self.get_user_by_username(username)
        available = await self.get_user_available_tickets(username)
        if available <= 0:
            raise ValueError("No tienes tickets disponibles para auto-asignar.")

        config = await self.get_config()
        total_seats = config.get("total_seats", 200)
        seats = await self.get_all_seats()

        free_seats = [i for i in range(1, total_seats + 1) if str(i) not in seats]
        if not free_seats:
            raise ValueError("¡La sala está completamente llena! No quedan asientos libres.")

        num_to_assign = min(count or available, len(free_seats), available)
        chosen_seats = random.sample(free_seats, num_to_assign)
        avatar = user.get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={username}"
        now_iso = datetime.now().isoformat()

        if self.use_supabase:
            try:
                inserts = [
                    {
                        "seat_number": num,
                        "username": username,
                        "avatar_url": avatar,
                        "claimed_at": now_iso
                    }
                    for num in chosen_seats
                ]
                self.supabase.table("seats").insert(inserts).execute()
            except Exception as e:
                print(f"[Supabase] Error en auto_pick: {e}")

        for num in chosen_seats:
            self.local_cache["seats"][str(num)] = {
                "seat_number": num,
                "username": username,
                "avatar": avatar,
                "claimed_at": now_iso
            }
        self._save_local()
        return chosen_seats

    # -----------------------------------------------------------------
    # WEBHOOKS & EVENTOS DE KICK
    # -----------------------------------------------------------------
    async def record_kick_event(self, username: str, event_type: str, count: int = 1, raw_payload: Optional[dict] = None) -> dict:
        user = await self.get_user_by_username(username)

        own_add = 0
        gift_add = 0
        bonus_add = 0

        if event_type == "sub" or "subscription.new" in event_type or "subscription.renewal" in event_type:
            own_add = 1
        elif "gift" in event_type:
            gift_add = count
        elif event_type == "manual_bonus":
            bonus_add = count

        new_own = user.get("own_subs", 0) + own_add
        new_gift = user.get("gifted_subs", 0) + gift_add
        new_bonus = user.get("bonus_tickets", 0) + bonus_add
        new_total = new_own + new_gift + new_bonus

        if self.use_supabase:
            try:
                self.supabase.table("profiles").update({
                    "own_subs": new_own,
                    "gifted_subs": new_gift,
                    "bonus_tickets": new_bonus,
                    "updated_at": datetime.now().isoformat()
                }).ilike("username", username.strip()).execute()

                self.supabase.table("kick_events").insert({
                    "event_type": event_type,
                    "username": username.strip(),
                    "kick_user_id": user.get("kick_user_id", ""),
                    "count": count,
                    "raw_payload": raw_payload or {}
                }).execute()
            except Exception as e:
                print(f"[Supabase] Error en record_kick_event: {e}")

        # Local
        user["own_subs"] = new_own
        user["gifted_subs"] = new_gift
        user["bonus_tickets"] = new_bonus
        user["total_tickets"] = new_total
        self.local_cache["users"][username] = user
        self._save_local()

        return user

    # -----------------------------------------------------------------
    # SORTEO & GANADORES
    # -----------------------------------------------------------------
    async def save_winner(self, winner_data: dict):
        if self.use_supabase:
            try:
                self.supabase.table("giveaway_config").update({
                    "winner_seat": winner_data["seat_number"],
                    "winner_username": winner_data["username"],
                    "winner_avatar": winner_data["avatar"],
                    "winner_odds": winner_data["win_probability"],
                    "winner_total_tickets": winner_data["user_total_tickets"],
                    "drawn_at": winner_data["drawn_at"]
                }).eq("id", "current").execute()

                self.supabase.table("draw_history").insert({
                    "seat_number": winner_data["seat_number"],
                    "username": winner_data["username"],
                    "avatar_url": winner_data["avatar"],
                    "total_tickets": winner_data["user_total_tickets"],
                    "win_probability": winner_data["win_probability"],
                    "prize": winner_data["prize"],
                    "drawn_at": winner_data["drawn_at"]
                }).execute()
            except Exception as e:
                print(f"[Supabase] Error en save_winner: {e}")

        self.local_cache["winner"] = winner_data
        self.local_cache["draw_history"].append(winner_data)
        self._save_local()

    async def reset_giveaway(self, clear_users: bool = False):
        if self.use_supabase:
            try:
                self.supabase.table("seats").delete().neq("seat_number", -1).execute()
                self.supabase.table("giveaway_config").update({
                    "winner_seat": None,
                    "winner_username": None,
                    "winner_avatar": None,
                    "winner_odds": None,
                    "winner_total_tickets": None,
                    "drawn_at": None
                }).eq("id", "current").execute()
            except Exception as e:
                print(f"[Supabase] Error en reset_giveaway: {e}")

        self.local_cache["seats"] = {}
        self.local_cache["winner"] = None
        self._save_local()

    async def get_all_users_list(self) -> List[dict]:
        if self.use_supabase:
            try:
                res = self.supabase.table("profiles").select("*").execute()
                seats = await self.get_all_seats()
                users_list = []
                for u in res.data:
                    uname = u["username"]
                    user_seats = [s["seat_number"] for s in seats.values() if s["username"] == uname]
                    total = u.get("total_tickets")
                    if total is None:
                        total = u.get("own_subs", 0) + u.get("gifted_subs", 0) + u.get("bonus_tickets", 0)
                    users_list.append({
                        "username": uname,
                        "display_name": u.get("display_name", uname),
                        "avatar": u.get("avatar_url", f"https://api.dicebear.com/7.x/bottts/svg?seed={uname}"),
                        "own_subs": u.get("own_subs", 0),
                        "gifted_subs": u.get("gifted_subs", 0),
                        "total_tickets": total,
                        "used_tickets": len(user_seats),
                        "seats": user_seats
                    })
                return users_list
            except Exception as e:
                print(f"[Supabase] Error get_all_users_list: {e}")

        # Local
        seats = self.local_cache.get("seats", {})
        result = []
        for uname, u in self.local_cache.get("users", {}).items():
            user_seats = [s["seat_number"] for s in seats.values() if s["username"] == uname]
            result.append({
                "username": uname,
                "display_name": u.get("display_name", uname),
                "avatar": u.get("avatar", f"https://api.dicebear.com/7.x/bottts/svg?seed={uname}"),
                "own_subs": u.get("own_subs", 0),
                "gifted_subs": u.get("gifted_subs", 0),
                "total_tickets": u.get("total_tickets", 0),
                "used_tickets": len(user_seats),
                "seats": user_seats
            })
        return result

db = SupabaseDataLayer()
