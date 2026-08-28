// Lógica de Producción de la Aplicación del Sorteo PS5
let state = null;
let currentFilter = 'all';
let searchQuery = '';
let ws = null;

// Elementos DOM
const navLoginBtn = document.getElementById('navLoginBtn');
const navDrawBtn = document.getElementById('navDrawBtn');
const navAdminBtn = document.getElementById('navAdminBtn');
const userPillBox = document.getElementById('userPillBox');
const navUserAvatar = document.getElementById('navUserAvatar');
const navUserName = document.getElementById('navUserName');
const navUserTickets = document.getElementById('navUserTickets');

const giveawayTitle = document.getElementById('giveawayTitle');
const channelNameText = document.getElementById('channelNameText');

const walletLoggedOut = document.getElementById('walletLoggedOut');
const walletLoggedIn = document.getElementById('walletLoggedIn');
const walletAvatar = document.getElementById('walletAvatar');
const walletUsername = document.getElementById('walletUsername');
const userRoleBadge = document.getElementById('userRoleBadge');
const statOwnSubs = document.getElementById('statOwnSubs');
const statGiftedSubs = document.getElementById('statGiftedSubs');
const statAvailableTickets = document.getElementById('statAvailableTickets');

const seatsGrid = document.getElementById('seatsGrid');
const autoPickBtn = document.getElementById('autoPickBtn');
const floatingBar = document.getElementById('floatingBar');
const floatingAvailableCount = document.getElementById('floatingAvailableCount');
const floatingAutoPickBtn = document.getElementById('floatingAutoPickBtn');

const countTotalSeats = document.getElementById('countTotalSeats');
const countFreeSeats = document.getElementById('countFreeSeats');
const countMySeats = document.getElementById('countMySeats');
const countTakenSeats = document.getElementById('countTakenSeats');
const searchSeatInput = document.getElementById('searchSeatInput');

const SUPABASE_URL = window.SUPABASE_URL || "https://genlkmueekefyxmiyhjv.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
let supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === 'function' && SUPABASE_ANON_KEY) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// -------------------------------------------------------------------
// 1. Cargar Estado (API Local o Supabase Directo en GitHub Pages)
// -------------------------------------------------------------------
async function loadState() {
  // Modo 1: API de Servidor (Local o Cloud)
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      state = await res.json();
      renderUI();
      return;
    }
  } catch (err) {
    // Si falla, entrar al Modo 2 (Supabase Directo para GitHub Pages)
  }

  // Modo 2: Supabase Directo (GitHub Pages)
  if (supabaseClient) {
    try {
      const [configRes, seatsRes, profilesRes] = await Promise.all([
        supabaseClient.table('giveaway_config').select('*').eq('id', 'current').single(),
        supabaseClient.table('seats').select('*'),
        supabaseClient.table('profiles').select('*')
      ]);

      const configData = configRes.data || {
        title: 'Sorteo Oficial PlayStation 5 🎮',
        prize: 'PlayStation 5 Slim (Edición Disco)',
        channel: 'Caoz',
        total_seats: 200,
        is_locked: false
      };

      const seatsMap = {};
      if (seatsRes.data) {
        seatsRes.data.forEach(s => {
          seatsMap[String(s.seat_number)] = {
            seat_number: s.seat_number,
            username: s.username,
            avatar: s.avatar_url,
            claimed_at: s.claimed_at
          };
        });
      }

      // Leer usuario en localStorage / Cookie
      const savedUser = localStorage.getItem('kick_user') || 'Bersek';
      const currentUserProfile = (profilesRes.data || []).find(p => p.username.toLowerCase() === savedUser.toLowerCase()) || {
        username: savedUser,
        display_name: savedUser,
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${savedUser}`,
        own_subs: 1,
        gifted_subs: 0,
        bonus_tickets: 0,
        total_tickets: 1
      };

      const isOwner = savedUser.toLowerCase() === 'caoz';
      const isMod = savedUser.toLowerCase() === 'bersek';
      const userSeats = Object.values(seatsMap).filter(s => s.username.toLowerCase() === savedUser.toLowerCase()).map(s => s.seat_number);

      state = {
        config: configData,
        has_supabase: true,
        has_kick_oauth: true,
        stats: {
          total_seats: configData.total_seats || 200,
          occupied_seats: Object.keys(seatsMap).length,
          available_seats: Math.max(0, (configData.total_seats || 200) - Object.keys(seatsMap).length),
          occupancy_percent: Math.round((Object.keys(seatsMap).length / (configData.total_seats || 200)) * 100),
          total_participants: new Set(Object.values(seatsMap).map(s => s.username)).size
        },
        user: {
          username: currentUserProfile.username,
          display_name: currentUserProfile.display_name || currentUserProfile.username,
          avatar: currentUserProfile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUserProfile.username}`,
          own_subs: currentUserProfile.own_subs || 0,
          gifted_subs: currentUserProfile.gifted_subs || 0,
          total_tickets: currentUserProfile.total_tickets || 1,
          used_tickets: userSeats.length,
          available_tickets: Math.max(0, (currentUserProfile.total_tickets || 1) - userSeats.length),
          my_seats: userSeats,
          is_logged_in: true,
          is_admin: isOwner || isMod,
          is_streamer: isOwner,
          is_moderator: isMod,
          role: isOwner ? 'streamer' : (isMod ? 'moderator' : 'viewer')
        },
        seats: seatsMap,
        winner: null,
        all_users_list: profilesRes.data || []
      };

      renderUI();
    } catch (e) {
      console.error('Error fetching Supabase direct:', e);
    }
  }
}

// -------------------------------------------------------------------
// 2. Renderizado Condicional de Roles y UI
// -------------------------------------------------------------------
function renderUI() {
  if (!state) return;

  const { config, stats, user, seats, winner } = state;

  giveawayTitle.textContent = config.title || 'Sorteo Oficial PlayStation 5 🎮';
  if (channelNameText) channelNameText.textContent = config.channel || 'Caoz';

  // Control de Acceso por Roles (Seguridad)
  const isLoggedIn = user.is_logged_in;
  const isAdmin = user.is_admin;

  if (isLoggedIn && user.username) {
    // Usuario Logueado
    navLoginBtn.style.display = 'none';
    userPillBox.style.display = 'flex';
    navUserAvatar.src = user.avatar;
    navUserName.textContent = `@${user.username}`;
    navUserTickets.textContent = `${user.available_tickets} Libres`;

    walletLoggedOut.style.display = 'none';
    walletLoggedIn.style.display = 'flex';
    walletAvatar.src = user.avatar;
    walletUsername.textContent = `@${user.username}`;
    statOwnSubs.textContent = user.own_subs || 0;
    statGiftedSubs.textContent = user.gifted_subs || 0;
    statAvailableTickets.textContent = user.available_tickets || 0;

    // Solo mostrar botones de Streamer si es Admin / Dueño
    if (isAdmin) {
      navAdminBtn.style.display = 'inline-flex';
      navDrawBtn.style.display = 'inline-flex';
      userRoleBadge.textContent = user.is_streamer ? '👑 Streamer' : '🛡️ Moderador';
      userRoleBadge.className = 'tag-badge tag-green';
    } else {
      navAdminBtn.style.display = 'none';
      navDrawBtn.style.display = 'none';
      userRoleBadge.textContent = '⭐ Espectador';
      userRoleBadge.className = 'tag-badge tag-cyan';
    }

    // Botón Auto-Pick
    if (user.available_tickets > 0) {
      autoPickBtn.disabled = false;
      autoPickBtn.textContent = `🎲 Auto-Asignar (${user.available_tickets} Libres)`;
      floatingBar.style.display = 'flex';
      floatingAvailableCount.textContent = user.available_tickets;
    } else {
      autoPickBtn.disabled = true;
      autoPickBtn.textContent = `🎲 Todos tus tickets asignados (${user.my_seats?.length || 0}/${user.total_tickets || 0})`;
      floatingBar.style.display = 'none';
    }

  } else {
    // Usuario Invitado / NO Logueado
    navLoginBtn.style.display = 'inline-flex';
    userPillBox.style.display = 'none';
    navAdminBtn.style.display = 'none';
    navDrawBtn.style.display = 'none';

    walletLoggedOut.style.display = 'block';
    walletLoggedIn.style.display = 'none';
    floatingBar.style.display = 'none';
  }

  // Contadores
  const total = config.total_seats || 200;
  const occupied = Object.keys(seats).length;
  const free = Math.max(0, total - occupied);
  const mySeatsCount = user.my_seats?.length || 0;
  const otherOccupied = Math.max(0, occupied - mySeatsCount);

  countTotalSeats.textContent = total;
  countFreeSeats.textContent = free;
  countMySeats.textContent = mySeatsCount;
  countTakenSeats.textContent = otherOccupied;

  renderSeatsGrid(total, seats, user, winner);
}

// -------------------------------------------------------------------
// 3. Renderizado de la Sala de Cine
// -------------------------------------------------------------------
function renderSeatsGrid(totalSeats, seats, user, winner) {
  seatsGrid.innerHTML = '';
  const currentUsername = (user.username || '').toLowerCase();

  for (let i = 1; i <= totalSeats; i++) {
    const seatKey = String(i);
    const isOccupied = seatKey in seats;
    const seatData = seats[seatKey];
    const isMine = isOccupied && (seatData.username || '').toLowerCase() === currentUsername;
    const isWinner = winner && winner.seat_number === i;

    // Filtros
    let matchesFilter = true;
    if (currentFilter === 'free' && isOccupied) matchesFilter = false;
    if (currentFilter === 'mine' && !isMine) matchesFilter = false;
    if (currentFilter === 'taken' && (!isOccupied || isMine)) matchesFilter = false;

    // Búsqueda
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const numMatch = String(i).includes(q);
      const userMatch = isOccupied && seatData.username.toLowerCase().includes(q);
      if (!numMatch && !userMatch) matchesFilter = false;
    }

    if (!matchesFilter) continue;

    const seatEl = document.createElement('div');
    seatEl.className = 'seat';
    seatEl.dataset.seatNumber = i;

    if (isWinner) {
      seatEl.classList.add('seat-winner');
    } else if (isMine) {
      seatEl.classList.add('seat-mine');
    } else if (isOccupied) {
      seatEl.classList.add('seat-taken');
    } else {
      seatEl.classList.add('seat-free');
    }

    seatEl.textContent = i;

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'seat-tooltip';

    if (isWinner) {
      tooltip.innerHTML = `<strong>🏆 ¡GANADOR DEL PS5!</strong> (@${winner.username})`;
    } else if (isMine) {
      tooltip.innerHTML = `<strong>⚡ Asiento #${i}</strong> (¡Es tuyo!)`;
    } else if (isOccupied) {
      const ownerAvatar = seatData.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${seatData.username}`;
      tooltip.innerHTML = `
        <img src="${ownerAvatar}" class="tooltip-avatar">
        <div>
          <div>Asiento #${i}</div>
          <strong style="color: #ff3366;">@${seatData.username}</strong>
        </div>
      `;
    } else {
      tooltip.innerHTML = `<strong>🟢 Asiento #${i} Disponible</strong> (Clic para reservar)`;
    }

    seatEl.appendChild(tooltip);
    seatEl.addEventListener('click', () => handleSeatClick(i, isMine, isOccupied));

    seatsGrid.appendChild(seatEl);
  }
}

// -------------------------------------------------------------------
// 4. Selección de Asientos
// -------------------------------------------------------------------
async function handleSeatClick(seatNumber, isMine, isOccupied) {
  if (!state.user.is_logged_in) {
    window.soundFX.playError();
    showToast('Debes iniciar sesión con Kick para reservar un asiento', true);
    return;
  }

  if (isOccupied && !isMine) {
    window.soundFX.playError();
    const owner = state.seats[String(seatNumber)]?.username || 'otro usuario';
    showToast(`El asiento #${seatNumber} ya pertenece a @${owner}`, true);
    return;
  }

  if (!isMine && state.user.available_tickets <= 0) {
    window.soundFX.playError();
    showToast(`No tienes tickets disponibles para el asiento #${seatNumber}. ¡Regala o compra una Sub en Kick para conseguir más!`, true);
    return;
  }

  try {
    const res = await fetch('/api/seats/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seat_numbers: [seatNumber] })
    });

    const data = await res.json();
    if (!res.ok) {
      window.soundFX.playError();
      showToast(data.detail || 'Error al seleccionar asiento', true);
      return;
    }

    if (isMine) {
      window.soundFX.playSeatRelease();
      showToast(`Asiento #${seatNumber} liberado.`);
    } else {
      window.soundFX.playSeatClick();
      showToast(`¡Asiento #${seatNumber} reservado con éxito! 🎟️`);
    }

    await loadState();

  } catch (err) {
    console.error('Error toggling seat:', err);
    window.soundFX.playError();
    showToast('Error de conexión con el servidor', true);
  }
}

// -------------------------------------------------------------------
// 5. Auto-Asignación de Números al Azar
// -------------------------------------------------------------------
async function handleAutoPick() {
  if (!state || !state.user.is_logged_in || state.user.available_tickets <= 0) {
    showToast('No tienes tickets disponibles para auto-asignar', true);
    return;
  }

  try {
    const res = await fetch('/api/seats/auto-pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await res.json();
    if (!res.ok) {
      window.soundFX.playError();
      showToast(data.detail || 'Error al auto-asignar', true);
      return;
    }

    window.soundFX.playSuccessChime();
    if (typeof confetti === 'function') {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }

    showToast(data.message || '¡Números asignados con éxito!');
    await loadState();

  } catch (err) {
    console.error('Error in auto-pick:', err);
    window.soundFX.playError();
    showToast('Error al auto-asignar asientos', true);
  }
}

// -------------------------------------------------------------------
// 6. WebSocket en Vivo
// -------------------------------------------------------------------
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'SEATS_UPDATED') {
        if (state) state.seats = data.seats;
        loadState();
      } else if (data.type === 'KICK_EVENT') {
        showToast(data.event.label);
        window.soundFX.playSuccessChime();
        loadState();
      } else if (data.type === 'DRAW_COMPLETED') {
        showToast(`🏆 ¡El ganador del sorteo es @${data.winner.username} con el Asiento #${data.winner.seat_number}!`);
        window.soundFX.playWinnerFanfare();
        if (typeof confetti === 'function') {
          confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 } });
        }
        loadState();
      } else if (data.type === 'CONFIG_UPDATED' || data.type === 'GIVEAWAY_RESET') {
        loadState();
      }
    } catch (err) {}
  };

  ws.onclose = () => setTimeout(initWebSocket, 3000);
}

// -------------------------------------------------------------------
// 7. Notificaciones Toast
// -------------------------------------------------------------------
function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `
    <span style="font-size: 1.2rem;">${isError ? '⚠️' : '🔔'}</span>
    <span style="font-size: 0.88rem; font-weight: 600;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// -------------------------------------------------------------------
// 8. Event Listeners
// -------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initWebSocket();

  autoPickBtn.addEventListener('click', handleAutoPick);
  floatingAutoPickBtn.addEventListener('click', handleAutoPick);

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderUI();
    });
  });

  searchSeatInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderUI();
  });

  const toggleStreamBtn = document.getElementById('toggleStreamBtn');
  const streamPlayerBox = document.getElementById('streamPlayerBox');
  if (toggleStreamBtn && streamPlayerBox) {
    toggleStreamBtn.addEventListener('click', () => {
      if (streamPlayerBox.style.display === 'none') {
        streamPlayerBox.style.display = 'block';
        toggleStreamBtn.textContent = '📺 Ocultar Stream';
      } else {
        streamPlayerBox.style.display = 'none';
        toggleStreamBtn.textContent = '📺 Mostrar Stream';
      }
    });
  }
});
