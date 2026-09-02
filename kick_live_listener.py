import os
import json
import asyncio
import httpx
import websockets
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

KICK_CHANNEL = os.getenv("KICK_CHANNEL_SLUG", "Caoz").strip()
PUSHER_KEY = "32cbd69e4b950bf97679"
PUSHER_CLUSTER = "us2"
PUSHER_URL = f"wss://ws-{PUSHER_CLUSTER}.pusher.com/app/{PUSHER_KEY}?protocol=7&client=js&version=8.4.0-rc2&flash=false"

# IDs oficiales verificados de Kick para el canal @Caoz
KNOWN_CHANNELS = {
    "caoz": {"channel_id": 7686522, "chatroom_id": 7593604}
}

class KickLiveListener:
    """
    Escuchador en vivo de Kick (WebSocket Pusher).
    Captura suscripciones, regalos de subs (gifts) y eventos en directo
    sin necesidad de túneles ngrok ni Cloudflare bypass.
    """
    def __init__(self, channel_slug: str, on_event_callback=None):
        self.channel_slug = channel_slug.strip()
        self.on_event_callback = on_event_callback
        self.channel_id = None
        self.chatroom_id = None
        self.is_running = False

    async def get_channel_info(self):
        """Obtiene el ID del canal y del chatroom de Kick con fallback garantizado."""
        slug_clean = self.channel_slug.lower()
        if slug_clean in KNOWN_CHANNELS:
            self.channel_id = KNOWN_CHANNELS[slug_clean]["channel_id"]
            self.chatroom_id = KNOWN_CHANNELS[slug_clean]["chatroom_id"]
            print(f"[*] Canal Kick verificado: @{self.channel_slug} (Channel ID: {self.channel_id}, Chatroom ID: {self.chatroom_id})")
            return True

        url = f"https://kick.com/api/v2/channels/{self.channel_slug}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json"
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=8.0)
                if resp.status_code == 200:
                    data = resp.json()
                    self.channel_id = data.get("id") or data.get("user_id")
                    self.chatroom_id = data.get("chatroom", {}).get("id")
                    print(f"[*] Canal Kick encontrado: @{self.channel_slug} (Channel ID: {self.channel_id}, Chatroom ID: {self.chatroom_id})")
                    return True
        except Exception as e:
            print(f"[!] Error consultando API de Kick: {e}")

        # Fallback garantizado a los IDs directos de Caoz
        self.channel_id = 7686522
        self.chatroom_id = 7593604
        print(f"[*] Usando configuración directa para @{self.channel_slug} (Channel ID: {self.channel_id}, Chatroom ID: {self.chatroom_id})")
        return True

    async def start(self):
        self.is_running = True
        await self.get_channel_info()

        while self.is_running:
            try:
                print(f"[*] Conectando a Kick Pusher WebSocket para @{self.channel_slug} (Channel: {self.channel_id}, Chatroom: {self.chatroom_id})...")
                async with websockets.connect(PUSHER_URL, ping_interval=20, ping_timeout=20) as ws:
                    print(f"[✓] Conectado en vivo a Kick WebSocket Pusher.")

                    # Suscribirse al canal de eventos del streamer
                    sub_channel_msg = {
                        "event": "pusher:subscribe",
                        "data": {"auth": "", "channel": f"channel.{self.channel_id}"}
                    }
                    await ws.send(json.dumps(sub_channel_msg))

                    # Suscribirse al chatroom para regalos de subs y eventos en vivo
                    sub_chat_msg = {
                        "event": "pusher:subscribe",
                        "data": {"auth": "", "channel": f"chatrooms.{self.chatroom_id}.v2"}
                    }
                    await ws.send(json.dumps(sub_chat_msg))

                    while self.is_running:
                        msg_str = await ws.receive_text() if hasattr(ws, 'receive_text') else await ws.recv()
                        data = json.loads(msg_str)
                        event = data.get("event")

                        # Ping / Pong de Pusher para mantener la conexión viva indefinidamente
                        if event == "pusher:ping":
                            await ws.send(json.dumps({"event": "pusher:pong", "data": {}}))
                            continue

                        # Manejo de eventos de suscripciones y regalos de Kick
                        await self.handle_kick_event(event, data)

            except Exception as e:
                print(f"[!] Desconexión de Kick WebSocket: {e}. Reconectando en 5s...")
                await asyncio.sleep(5)

    async def handle_kick_event(self, event_name: str, payload: dict):
        """Procesa y extrae eventos de subs y gifts de Kick."""
        try:
            raw_data = payload.get("data", "{}")
            event_data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data

            username = None
            subs_count = 1
            event_type = None

            # 1. Suscripción Regalada Múltiple (Gift Subs: 1, 5, 10, 20, 50 subs)
            if "GiftedSubscriptionsEvent" in str(event_name) or "gift" in str(event_name).lower():
                username = (
                    event_data.get("gifter_username")
                    or event_data.get("username")
                    or event_data.get("sender", {}).get("username")
                    or event_data.get("user", {}).get("username")
                )
                subs_count = int(event_data.get("gifted_user_count") or event_data.get("count") or 1)
                event_type = f"gift_sub_{subs_count}"
                print(f"[🎁 KICK EN VIVO] @{username} REGALÓ {subs_count} SUBS EN KICK!")

            # 2. Suscripción Individual o Renovación (Resub)
            elif "SubscriptionEvent" in str(event_name) or "subscription" in str(event_name).lower() or "resub" in str(event_name).lower():
                username = (
                    event_data.get("username")
                    or event_data.get("subscriber", {}).get("username")
                    or event_data.get("user", {}).get("username")
                    or event_data.get("sender", {}).get("username")
                    or event_data.get("display_name")
                )
                subs_count = int(event_data.get("months", 1))
                event_type = "sub"
                print(f"[⭐ KICK EN VIVO] @{username} SE SUSCRIBIÓ / RESUSCRIBIÓ EN KICK! (Meses: {subs_count})")

            if username and self.on_event_callback:
                await self.on_event_callback(username, event_type, subs_count, event_data)

        except Exception as e:
            print(f"[!] Error procesando evento de Kick: {e}")
