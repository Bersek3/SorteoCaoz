# 🎮 Sistema de Sorteo PS5 Kick - Selección Estilo Sala de Cine 🎟️

Plataforma profesional para streamers de **Kick.com** diseñada para realizar sorteos de gran escala (como una PlayStation 5) con un sistema de selección de números interactivo inspirado en las salas de cine (donde cada usuario elige su asiento exacto).

---

## 🌟 Características Principales

1. **Anti-Fraude y Control de Identidad:**
   - Cada suscripción comprada o regalada equivale a **1 Ticket**.
   - Los espectadores inician sesión o se identifican con su **Kick User ID oficial**.
   - Control de saldo atómico: el sistema no permite que nadie elija más números de los que tiene pagados.
2. **Sala de Cine Interactiva (Matrix de Asientos):**
   - Visualización neón cyberpunk con estados en tiempo real:
     - 🟢 **Disponible:** Libre para reservar.
     - ⚡ **Mis Números:** Tus números asignados.
     - 🔒 **Ocupado:** Reservado por otro espectador (muestra avatar y nombre de Kick al pasar el ratón).
   - Botón **"Auto-Asignar Asientos"** para espectadores que regalan 10, 20 o 50 subs de golpe.
3. **Panel de Control del Streamer (`/admin`):**
   - Métricas en vivo (Capacidad, Ocupación %, Participantes únicos).
   - **Simulador de Webhooks de Kick:** Prueba en directo qué pasa cuando alguien regala 5 subs o se suscribe.
   - Editor de capacidad de sala (50, 100, 200, 500, 1000 cupos), título y premios.
   - Asignación manual de tickets bonus y reinicio de sala.
4. **Pantalla de Sorteo para OBS Studio (`/draw`):**
   - Diseñada como fuente de navegador (*Browser Source*) para tu transmisión en directo.
   - Ruleta cinemática con efectos de sonido de tensión y desaceleración gradual.
   - Revelación épica del ganador con su avatar de Kick, confeti y fanfarria.

---

## 🚀 Cómo Iniciar el Proyecto

### Opción 1 (Doble Clic):
Haz doble clic en el archivo **`start.bat`**. Se iniciará el servidor y se abrirá automáticamente tu navegador.

### Opción 2 (Por Consola / Terminal):
```bash
python app.py
```

---

## 🌐 Enlaces del Sistema

* 🎟️ **Pantalla de Espectadores:** [http://localhost:8000](http://localhost:8000)
* 👑 **Panel de Streamer:** [http://localhost:8000/admin](http://localhost:8000/admin)
* 🎰 **Ruleta para OBS Studio:** [http://localhost:8000/draw](http://localhost:8000/draw)

---

## 🎥 Cómo Configurar en OBS Studio

1. En **OBS Studio**, añade una nueva fuente: **Navegador (Browser)**.
2. En la URL pon: `http://localhost:8000/draw`
3. Ajusta el tamaño a `1920` de ancho por `1080` de alto.
4. Marca la casilla **"Controlar audio a través de OBS"** si deseas escuchar los efectos de sonido de la ruleta.
5. ¡Listo! Cuando sea el momento del sorteo en vivo, haz clic en **"INICIAR SORTEO EN VIVO"** y la ruleta girará en directo en tu stream.

---

## 🔒 Prevención de Colisiones y Trampas
* **Transacciones atómicas:** Si dos usuarios hacen clic en el mismo asiento en el mismo milisegundo, el servidor valida cuál llegó primero y notifica al segundo que el asiento acaba de ser tomado.
* **Persistencia segura:** Los datos se guardan continuamente en `data/giveaway_data.json` para que nunca se pierda ningún ticket ni asiento aunque se apague el PC.
