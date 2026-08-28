// Lógica de Producción del Sorteo PS5 - Modo GitHub Pages + Supabase Directo
let state = null;
let currentFilter = 'all';
let searchQuery = '';

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

const seatsSelectionArea = document.getElementById('seatsSelectionArea');
const seatsLockedBox = document.getElementById('seatsLockedBox');

// -------------------------------------------------------------------
// 1. Cargar Estado Directamente desde Supabase Cloud
// -------------------------------------------------------------------
async function loadState() {
  if (!supabase) {
    console.error('Supabase no está disponible');
    return;
  }

  try {
    const savedUser = localStorage.getItem('kick_user');
    const roleInfo = checkUserRole(savedUser);

    // Consultas paralelas a Supabase
    const [configRes, seatsRes, profilesRes] = await Promise.all([
      supabase.from('giveaway_config').select('*').eq('id', 'current').single(),
      supabase.from('seats').select('*'),
      supabase.from('profiles').select('*')
    ]);

    const configData = configRes.data || {
      title: 'Sorteo Oficial PlayStation 5 🎮',
      prize: 'PlayStation 5 Slim (Edición Disco)',
      channel_slug: 'Caoz',
      total_seats: 200,
      is_locked: false
    };

    // Mapeo de Asientos
    const seatsMap = {};
    if (seatsRes.data) {
      seatsRes.data.forEach((s) => {
        seatsMap[String(s.seat_number)] = {
          seat_number: s.seat_number,
          username: s.username,
          avatar: s.avatar_url,
          claimed_at: s.claimed_at
        };
      });
    }

    let currentUserProfile = null;
    let userSeats = [];

    if (savedUser) {
      currentUserProfile = (profilesRes.data || []).find(
        (p) => p.username.toLowerCase() === savedUser.toLowerCase()
      );

      // Si el usuario no existe en Supabase, crearlo automáticamente
      if (!currentUserProfile) {
        const isOwner = savedUser.toLowerCase() === 'caoz';
        const newProfile = {
          kick_user_id: String(Math.abs(hashString(savedUser)) % 10000000),
          username: savedUser,
          display_name: savedUser,
          avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${savedUser}`,
          is_streamer: isOwner,
          own_subs: isOwner ? 0 : 1,
          gifted_subs: 0,
          bonus_tickets: 0
        };

        const insertRes = await supabase.from('profiles').insert(newProfile).select().single();
        currentUserProfile = insertRes.data || newProfile;
      }

      userSeats = Object.values(seatsMap)
        .filter((s) => s.username.toLowerCase() === savedUser.toLowerCase())
        .map((s) => s.seat_number);
    }

    const totalSeats = configData.total_seats || 200;
    const occupiedCount = Object.keys(seatsMap).length;
    const totalTickets = currentUserProfile ? (currentUserProfile.total_tickets ?? ((currentUserProfile.own_subs || 0) + (currentUserProfile.gifted_subs || 0) + (currentUserProfile.bonus_tickets || 0))) : 0;
    const availableTickets = Math.max(0, totalTickets - userSeats.length);

    state = {
      config: {
        title: configData.title || 'Sorteo Oficial PlayStation 5 🎮',
        prize: configData.prize || 'PlayStation 5 Slim',
        channel: configData.channel_slug || 'Caoz',
        total_seats: totalSeats,
        is_locked: configData.is_locked || false
      },
      stats: {
        total_seats: totalSeats,
        occupied_seats: occupiedCount,
        available_seats: Math.max(0, totalSeats - occupiedCount),
        occupancy_percent: Math.round((occupiedCount / totalSeats) * 100),
        total_participants: new Set(Object.values(seatsMap).map((s) => s.username)).size
      },
      user: {
        ...(currentUserProfile || {}),
        username: savedUser,
        display_name: currentUserProfile?.display_name || savedUser,
        avatar: currentUserProfile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${savedUser || 'Guest'}`,
        own_subs: currentUserProfile?.own_subs || 0,
        gifted_subs: currentUserProfile?.gifted_subs || 0,
        total_tickets: totalTickets,
        used_tickets: userSeats.length,
        available_tickets: availableTickets,
        my_seats: userSeats,
        ...roleInfo
      },
      seats: seatsMap,
      winner: configData.winner_seat ? {
        seat_number: configData.winner_seat,
        username: configData.winner_username,
        avatar: configData.winner_avatar,
        user_total_tickets: configData.winner_total_tickets,
        win_probability: configData.winner_odds,
        prize: configData.prize
      } : null,
      all_users_list: profilesRes.data || []
    };

    renderUI();
  } catch (err) {
    console.error('Error cargando datos de Supabase:', err);
  }
}

// -------------------------------------------------------------------
// 2. Renderizado de Interfaz
// -------------------------------------------------------------------
function renderUI() {
  if (!state) return;

  const { config, stats, user, seats, winner } = state;

  giveawayTitle.textContent = config.title;
  if (channelNameText) channelNameText.textContent = config.channel;

  const isLoggedIn = user.is_logged_in && user.username;
  const isAdmin = user.is_admin;

  if (isLoggedIn) {
    navLoginBtn.style.display = 'none';
    userPillBox.style.display = 'flex';
    navUserAvatar.src = user.avatar;
    navUserName.textContent = `@${user.username}`;
    navUserTickets.textContent = `${user.available_tickets} Libres`;

    walletLoggedOut.style.display = 'none';
    walletLoggedIn.style.display = 'flex';
    walletAvatar.src = user.avatar;
    walletUsername.textContent = `@${user.username}`;
    statOwnSubs.textContent = user.own_subs;
    statGiftedSubs.textContent = user.gifted_subs;
    statAvailableTickets.textContent = user.available_tickets;

    // Mostrar mapa de selección
    if (seatsSelectionArea) seatsSelectionArea.style.display = 'block';
    if (seatsLockedBox) seatsLockedBox.style.display = 'none';

    // Botones de Admin
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

    if (user.available_tickets > 0) {
      autoPickBtn.disabled = false;
      autoPickBtn.textContent = `🎲 Auto-Asignar (${user.available_tickets} Libres)`;
      floatingBar.style.display = 'flex';
      floatingAvailableCount.textContent = user.available_tickets;
    } else {
      autoPickBtn.disabled = true;
      autoPickBtn.textContent = `🎲 Todos tus tickets asignados (${user.my_seats.length}/${user.total_tickets})`;
      floatingBar.style.display = 'none';
    }

    // Contadores & Grid
    countTotalSeats.textContent = stats.total_seats;
    countFreeSeats.textContent = stats.available_seats;
    countMySeats.textContent = user.my_seats.length;
    countTakenSeats.textContent = Math.max(0, stats.occupied_seats - user.my_seats.length);

    renderSeatsGrid(stats.total_seats, seats, user, winner);

  } else {
    navLoginBtn.style.display = 'inline-flex';
    userPillBox.style.display = 'none';
    navAdminBtn.style.display = 'none';
    navDrawBtn.style.display = 'none';

    walletLoggedOut.style.display = 'block';
    walletLoggedIn.style.display = 'none';
    floatingBar.style.display = 'none';

    if (seatsSelectionArea) seatsSelectionArea.style.display = 'none';
    if (seatsLockedBox) seatsLockedBox.style.display = 'block';
  }
}

// -------------------------------------------------------------------
// 3. Renderizado de Asientos
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

    let matchesFilter = true;
    if (currentFilter === 'free' && isOccupied) matchesFilter = false;
    if (currentFilter === 'mine' && !isMine) matchesFilter = false;
    if (currentFilter === 'taken' && (!isOccupied || isMine)) matchesFilter = false;

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
// 4. Selección Directa en Supabase
// -------------------------------------------------------------------
async function handleSeatClick(seatNumber, isMine, isOccupied) {
  if (!state.user.is_logged_in) {
    window.soundFX.playError();
    promptLogin();
    return;
  }

  if (isOccupied && !isMine) {
    window.soundFX.playError();
    const owner = state.seats[String(seatNumber)]?.username || 'otro viewer';
    showToast(`El asiento #${seatNumber} ya pertenece a @${owner}`, true);
    return;
  }

  if (!isMine && state.user.available_tickets <= 0) {
    window.soundFX.playError();
    showToast(`No tienes tickets disponibles para el asiento #${seatNumber}. ¡Regala o compra una Sub en Kick para conseguir más!`, true);
    return;
  }

  try {
    if (isMine) {
      // Liberar asiento en Supabase
      await supabase.from('seats').delete().eq('seat_number', seatNumber);
      window.soundFX.playSeatRelease();
      showToast(`Asiento #${seatNumber} liberado.`);
    } else {
      // Reservar asiento en Supabase
      await supabase.from('seats').insert({
        seat_number: seatNumber,
        username: state.user.username,
        avatar_url: state.user.avatar,
        claimed_at: new Date().toISOString()
      });
      window.soundFX.playSeatClick();
      showToast(`¡Asiento #${seatNumber} reservado con éxito! 🎟️`);
    }

    await loadState();
  } catch (err) {
    console.error('Error modificando asiento en Supabase:', err);
    window.soundFX.playError();
    showToast('Error al actualizar asiento en la base de datos', true);
  }
}

// -------------------------------------------------------------------
// 5. Auto-Pick Directo en Supabase
// -------------------------------------------------------------------
async function handleAutoPick() {
  if (!state || !state.user.is_logged_in || state.user.available_tickets <= 0) {
    showToast('No tienes tickets disponibles para auto-asignar', true);
    return;
  }

  try {
    const totalSeats = state.config.total_seats;
    const occupiedKeys = new Set(Object.keys(state.seats));
    const freeSeats = [];

    for (let i = 1; i <= totalSeats; i++) {
      if (!occupiedKeys.has(String(i))) freeSeats.push(i);
    }

    if (freeSeats.length === 0) {
      showToast('¡La sala de cine está completamente llena!', true);
      return;
    }

    const countToPick = Math.min(state.user.available_tickets, freeSeats.length);
    // Shuffle
    const shuffled = freeSeats.sort(() => 0.5 - Math.random());
    const chosen = shuffled.slice(0, countToPick);

    const inserts = chosen.map((num) => ({
      seat_number: num,
      username: state.user.username,
      avatar_url: state.user.avatar,
      claimed_at: new Date().toISOString()
    }));

    await supabase.from('seats').insert(inserts);

    window.soundFX.playSuccessChime();
    if (typeof confetti === 'function') {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }

    showToast(`¡Se han asignado ${chosen.length} asientos de la suerte a tu cuenta! 🎟️`);
    await loadState();
  } catch (err) {
    console.error('Error en auto-pick:', err);
    showToast('Error al auto-asignar asientos', true);
  }
}

// -------------------------------------------------------------------
// 6. Iniciar / Cerrar Sesión con Kick
// -------------------------------------------------------------------
function promptLogin() {
  const username = prompt('Ingresa tu nombre de usuario de Kick:');
  if (username && username.trim()) {
    localStorage.setItem('kick_user', username.trim());
    showToast(`Sesión iniciada como @${username.trim()}`);
    loadState();
  }
}

function handleLogout() {
  localStorage.removeItem('kick_user');
  showToast('Has cerrado sesión.');
  loadState();
}

// -------------------------------------------------------------------
// 7. Supabase Realtime (Sincronización en Vivo para todos los viewers)
// -------------------------------------------------------------------
function initSupabaseRealtime() {
  if (!supabase) return;

  supabase
    .channel('public_live_giveaway')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' }, () => {
      loadState();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'giveaway_config' }, () => {
      loadState();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      loadState();
    })
    .subscribe();
}

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

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// -------------------------------------------------------------------
// 8. Event Listeners
// -------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initSupabaseRealtime();

  autoPickBtn.addEventListener('click', handleAutoPick);
  floatingAutoPickBtn.addEventListener('click', handleAutoPick);

  if (navLoginBtn) {
    navLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      promptLogin();
    });
  }

  const logoutBtn = document.querySelector('a[href="/api/auth/logout"]') || document.querySelector('a[title="Cerrar Sesión"]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });
  }

  const lockedLoginBtn = document.querySelector('#seatsLockedBox a');
  if (lockedLoginBtn) {
    lockedLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      promptLogin();
    });
  }

  const loggedOutWalletBtn = document.querySelector('#walletLoggedOut a');
  if (loggedOutWalletBtn) {
    loggedOutWalletBtn.addEventListener('click', (e) => {
      e.preventDefault();
      promptLogin();
    });
  }

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
