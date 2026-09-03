// Lógica Principal de la Aplicación del Sorteo - Integrada con Supabase Cloud REST y Kick OAuth
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

window.addEventListener('beforeunload', () => {
  window.scrollTo(0, 0);
});

window.addEventListener('load', () => {
  window.scrollTo(0, 0);
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.refresh();
  }
});

let state = null;
let currentFilter = 'all';
let searchQuery = '';
let countdownInterval = null;

// Elementos DOM
const giveawayTitle = document.getElementById('giveawayTitle');
const prizeBadge = document.getElementById('prizeBadge');
const channelNameText = document.getElementById('channelNameText');
const statsSummaryText = document.getElementById('statsSummaryText');
const progressBar = document.getElementById('progressBar');

const userPillBox = document.getElementById('userPillBox');
const navUserAvatar = document.getElementById('navUserAvatar');
const navUserName = document.getElementById('navUserName');
const navUserTickets = document.getElementById('navUserTickets');
const navLoginBtn = document.getElementById('navLoginBtn');
const navDrawBtn = document.getElementById('navDrawBtn');
const navAdminBtn = document.getElementById('navAdminBtn');
const logoutBtn = document.getElementById('logoutBtn');

const walletCard = document.getElementById('walletCard');
const walletLoggedOut = document.getElementById('walletLoggedOut');
const walletLoggedIn = document.getElementById('walletLoggedIn');
const walletLoginBtn = document.getElementById('walletLoginBtn');
const walletAvatar = document.getElementById('walletAvatar');
const walletUsername = document.getElementById('walletUsername');
const userRoleBadge = document.getElementById('userRoleBadge');
const statOwnSubs = document.getElementById('statOwnSubs');
const statGiftedSubs = document.getElementById('statGiftedSubs');
const statAvailableTickets = document.getElementById('statAvailableTickets');
const autoPickBtn = document.getElementById('autoPickBtn');

const seatsGrid = document.getElementById('seatsGrid');
const countTotalSeats = document.getElementById('countTotalSeats');
const countFreeSeats = document.getElementById('countFreeSeats');
const countMySeats = document.getElementById('countMySeats');
const countTakenSeats = document.getElementById('countTakenSeats');
const searchSeatInput = document.getElementById('searchSeatInput');

const loginModal = document.getElementById('loginModal');
const closeLoginModal = document.getElementById('closeLoginModal');
const loginForm = document.getElementById('loginForm');
const kickUsernameInput = document.getElementById('kickUsernameInput');
const lockedLoginBtn = document.getElementById('lockedLoginBtn');
const seatsSelectionArea = document.getElementById('seatsSelectionArea');
const seatsLockedBox = document.getElementById('seatsLockedBox');

// -------------------------------------------------------------------
// 1. Cargar Estado Directamente desde Supabase Cloud (REST Seguro)
// -------------------------------------------------------------------
async function loadState() {
  try {
    const savedUser = localStorage.getItem('kick_user');
    const roleInfo = (typeof checkUserRole === 'function')
      ? checkUserRole(savedUser)
      : { is_logged_in: !!savedUser, is_admin: false, is_streamer: false, is_moderator: false, role: 'viewer' };

    // Consultas directas y seguras a Supabase con cabeceras de autorización
    const [configDataList, seatsList, profilesList] = await Promise.all([
      supabaseRest('giveaway_config', 'GET', null, 'id=eq.current').catch(() => null),
      supabaseRest('seats', 'GET').catch(() => []),
      supabaseRest('profiles', 'GET').catch(() => [])
    ]);

    const configData = (configDataList && configDataList[0]) || {
      title: 'Sorteo Oficial PlayStation 5 🎮',
      prize: 'PlayStation 5 Slim (Edición Disco)',
      channel_slug: 'Caoz',
      total_seats: 200,
      is_locked: false,
      draw_date: null
    };

    // Mapeo de Números
    const seatsMap = {};
    if (seatsList && Array.isArray(seatsList)) {
      seatsList.forEach((s) => {
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
      const isOwner = savedUser.toLowerCase() === 'caoz';

      currentUserProfile = (profilesList || []).find(
        (p) => p.username && p.username.toLowerCase() === savedUser.toLowerCase()
      );

      // Si el usuario no existe en Supabase, crearlo automáticamente con 0 subs por defecto
      if (!currentUserProfile) {
        const newProfile = {
          kick_user_id: String(Math.abs(hashString(savedUser)) % 10000000),
          username: savedUser,
          display_name: savedUser,
          avatar_url: localStorage.getItem('kick_avatar') || `https://api.dicebear.com/7.x/bottts/svg?seed=${savedUser}`,
          is_streamer: isOwner,
          own_subs: 0,
          gifted_subs: 0,
          bonus_tickets: 0
        };

        try {
          const inserted = await supabaseRest('profiles', 'POST', newProfile);
          currentUserProfile = (inserted && inserted[0]) || newProfile;
        } catch (e) {
          currentUserProfile = newProfile;
        }
      }

      // Verificación automática de Suscripción o Resub con la API de Kick
      if (currentUserProfile && (currentUserProfile.own_subs || 0) === 0) {
        try {
          const backendUrl = window.location.hostname.includes('onrender.com') ? '' : 'https://sorteocaoz.onrender.com';
          const subCheck = await fetch(`${backendUrl}/api/check-kick-sub/${encodeURIComponent(savedUser)}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null);

          if (subCheck && subCheck.is_subscriber) {
            currentUserProfile.own_subs = 1;
            currentUserProfile.total_tickets = ((currentUserProfile.own_subs || 1) + (currentUserProfile.gifted_subs || 0) + (currentUserProfile.bonus_tickets || 0));
          }
        } catch (e) {
          // Ignorar silenciosamente si no hay red
        }
      }

      userSeats = Object.values(seatsMap)
        .filter((s) => s.username && s.username.toLowerCase() === savedUser.toLowerCase())
        .map((s) => s.seat_number);
    }

    const totalSeats = configData.total_seats || 200;
    const occupiedCount = Object.keys(seatsMap).length;
    const totalTickets = currentUserProfile ? (currentUserProfile.total_tickets ?? ((currentUserProfile.own_subs || 0) + (currentUserProfile.gifted_subs || 0) + (currentUserProfile.bonus_tickets || 0))) : 0;
    const availableTickets = Math.max(0, totalTickets - userSeats.length);

    const drawDateIso = configData.drawn_at || configData.broadcaster_id || configData.draw_date || null;

    state = {
      config: {
        title: configData.title || 'Sorteo Oficial PlayStation 5 🎮',
        prize: configData.prize || 'PlayStation 5 Slim',
        channel: configData.channel_slug || 'Caoz',
        total_seats: totalSeats,
        is_locked: configData.is_locked || false,
        draw_date: drawDateIso
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
        avatar: currentUserProfile?.avatar_url || localStorage.getItem('kick_avatar') || `https://api.dicebear.com/7.x/bottts/svg?seed=${savedUser || 'Guest'}`,
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
      all_users_list: profilesList || []
    };

    renderUI();
    initCountdown(state.config.draw_date);
  } catch (err) {
    console.error('Error cargando datos de Supabase:', err);
  }
}

// -------------------------------------------------------------------
// 2. Cuenta Regresiva (Countdown Clock)
// -------------------------------------------------------------------
function initCountdown(drawDateIso) {
  if (countdownInterval) clearInterval(countdownInterval);

  const cdDays = document.getElementById('cdDays');
  const cdHours = document.getElementById('cdHours');
  const cdMinutes = document.getElementById('cdMinutes');
  const cdSeconds = document.getElementById('cdSeconds');
  const countdownBox = document.getElementById('countdownBox');

  if (!drawDateIso) {
    if (cdDays) cdDays.textContent = '00';
    if (cdHours) cdHours.textContent = '00';
    if (cdMinutes) cdMinutes.textContent = '00';
    if (cdSeconds) cdSeconds.textContent = '00';
    return;
  }

  const targetDate = new Date(drawDateIso).getTime();

  function updateClock() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance <= 0) {
      if (cdDays) cdDays.textContent = '00';
      if (cdHours) cdHours.textContent = '00';
      if (cdMinutes) cdMinutes.textContent = '00';
      if (cdSeconds) cdSeconds.textContent = '00';
      if (countdownBox) {
        countdownBox.style.borderColor = 'var(--kick-green)';
        countdownBox.style.boxShadow = '0 0 30px var(--kick-green-glow)';
      }
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    if (cdDays) cdDays.textContent = String(days).padStart(2, '0');
    if (cdHours) cdHours.textContent = String(hours).padStart(2, '0');
    if (cdMinutes) cdMinutes.textContent = String(minutes).padStart(2, '0');
    if (cdSeconds) cdSeconds.textContent = String(seconds).padStart(2, '0');
  }

  updateClock();
  countdownInterval = setInterval(updateClock, 1000);
}

// -------------------------------------------------------------------
// 3. Renderizar Interfaz Protegida contra Nulls
// -------------------------------------------------------------------
function renderUI() {
  if (!state) return;

  const { config, stats, user, seats, winner } = state;

  // Header & Info
  if (giveawayTitle) giveawayTitle.textContent = config.title || '';
  if (prizeBadge) prizeBadge.textContent = `🎁 ${config.prize || ''}`;
  if (channelNameText) channelNameText.textContent = config.channel || 'Caoz';

  // Barra de progreso y estadísticas
  if (progressBar) progressBar.style.width = `${stats.occupancy_percent || 0}%`;
  if (statsSummaryText) statsSummaryText.textContent = `${stats.occupied_seats || 0} de ${stats.total_seats || 200} números elegidos (${stats.occupancy_percent || 0}%) • ${stats.total_participants || 0} participantes`;

  // Autenticación de Usuario
  if (user && user.is_logged_in) {
    const isAdmin = (typeof checkUserRole === 'function') ? checkUserRole(user.username).is_admin : (user.is_streamer || user.is_moderator);

    if (navLoginBtn) navLoginBtn.style.display = 'none';
    if (userPillBox) userPillBox.style.display = 'flex';
    if (navUserAvatar) navUserAvatar.src = user.avatar;
    if (navUserName) navUserName.textContent = `@${user.username}`;
    if (navUserTickets) navUserTickets.textContent = `${user.available_tickets || 0} Libres`;

    if (walletLoggedOut) walletLoggedOut.style.display = 'none';
    if (walletLoggedIn) walletLoggedIn.style.display = 'flex';
    if (walletAvatar) walletAvatar.src = user.avatar;
    if (walletUsername) walletUsername.textContent = `@${user.username}`;
    if (statOwnSubs) statOwnSubs.textContent = user.own_subs || 0;
    if (statGiftedSubs) statGiftedSubs.textContent = user.gifted_subs || 0;
    if (statAvailableTickets) statAvailableTickets.textContent = user.available_tickets || 0;

    // Mostrar mapa de selección de números
    if (seatsSelectionArea) seatsSelectionArea.style.display = 'block';
    if (seatsLockedBox) seatsLockedBox.style.display = 'none';

    const dropdownUserName = document.getElementById('dropdownUserName');
    const dropdownRoleBadge = document.getElementById('dropdownRoleBadge');
    if (dropdownUserName) dropdownUserName.textContent = `@${user.username}`;
    if (dropdownRoleBadge) {
      if (isAdmin) {
        dropdownRoleBadge.textContent = user.is_streamer ? '👑 Streamer' : '🛡️ Moderador';
        dropdownRoleBadge.style.color = 'var(--kick-green)';
      } else {
        dropdownRoleBadge.textContent = '⭐ Espectador';
        dropdownRoleBadge.style.color = '#00f2fe';
      }
    }

    // Botones de Admin
    if (navAdminBtn) navAdminBtn.style.display = isAdmin ? 'flex' : 'none';
    if (navDrawBtn) navDrawBtn.style.display = isAdmin ? 'flex' : 'none';
    if (userRoleBadge) {
      if (isAdmin) {
        userRoleBadge.textContent = user.is_streamer ? '👑 Streamer' : '🛡️ Moderador';
        userRoleBadge.className = 'tag-badge tag-green';
      } else {
        userRoleBadge.textContent = '⭐ Espectador';
        userRoleBadge.className = 'tag-badge tag-cyan';
      }
    }

    if (autoPickBtn) {
      if (user.available_tickets > 0) {
        autoPickBtn.disabled = false;
        autoPickBtn.textContent = `🎲 Auto-Elegir (${user.available_tickets} Libres)`;
      } else {
        autoPickBtn.disabled = true;
        autoPickBtn.textContent = (user.total_tickets > 0)
          ? `🎲 Todos tus números elegidos (${user.my_seats.length}/${user.total_tickets})`
          : `🎲 Sin Tickets Disponibles (0/0)`;
      }
    }

    // Contadores & Grid
    if (countTotalSeats) countTotalSeats.textContent = stats.total_seats || 200;
    if (countFreeSeats) countFreeSeats.textContent = stats.available_seats || 0;
    if (countMySeats) countMySeats.textContent = user.my_seats ? user.my_seats.length : 0;
    if (countTakenSeats) countTakenSeats.textContent = Math.max(0, (stats.occupied_seats || 0) - (user.my_seats ? user.my_seats.length : 0));

    if (seatsGrid) {
      renderSeatsGrid(stats.total_seats, seats, user, winner);
    }

  } else {
    if (navLoginBtn) navLoginBtn.style.display = 'inline-flex';
    if (userPillBox) userPillBox.style.display = 'none';
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    if (userDropdownMenu) userDropdownMenu.classList.remove('active');
    if (navAdminBtn) navAdminBtn.style.display = 'none';
    if (navDrawBtn) navDrawBtn.style.display = 'none';

    if (walletLoggedOut) walletLoggedOut.style.display = 'block';
    if (walletLoggedIn) walletLoggedIn.style.display = 'none';

    if (seatsSelectionArea) seatsSelectionArea.style.display = 'none';
    if (seatsLockedBox) seatsLockedBox.style.display = 'block';
  }
}

// -------------------------------------------------------------------
// 4. Renderizado de Números
// -------------------------------------------------------------------
function renderSeatsGrid(totalSeats, seats, user, winner) {
  if (!seatsGrid) return;
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
      const matchNum = seatKey.includes(searchQuery);
      const matchUser = isOccupied && (seatData.username || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchNum && !matchUser) matchesFilter = false;
    }

    if (!matchesFilter) continue;

    const seatEl = document.createElement('div');
    seatEl.className = 'seat-item';
    seatEl.dataset.seatNumber = i;

    if (isWinner) {
      seatEl.classList.add('winner-seat');
    } else if (isMine) {
      seatEl.classList.add('mine');
    } else if (isOccupied) {
      seatEl.classList.add('taken');
    } else {
      seatEl.classList.add('free');
    }

    if (isMine) {
      seatEl.innerHTML = `
        <span class="seat-num">${i}</span>
        <span class="seat-user-tag">MÍO</span>
      `;
    } else if (isOccupied) {
      seatEl.innerHTML = `
        <span class="seat-num">${i}</span>
        <span class="seat-user-tag">OCUPADO</span>
      `;
    } else {
      seatEl.innerHTML = `
        <span class="seat-num">${i}</span>
      `;
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'seat-tooltip';

    if (isWinner) {
      tooltip.innerHTML = `
        <div style="font-weight: 800; color: #ffd700;">🏆 ¡NÚMERO GANADOR #${i}!</div>
        <div style="color: #ffffff;">Ganador: @${winner.username}</div>
      `;
    } else if (isMine) {
      tooltip.innerHTML = `
        <div style="font-weight: 700; color: var(--kick-green);">Tu Número #${i}</div>
        <div style="color: var(--text-secondary); font-size: 0.75rem;">(Clic para liberar tu número)</div>
      `;
    } else if (isOccupied) {
      tooltip.innerHTML = `
        <div style="font-weight: 700; color: #ff6688;">🔒 Número #${i} Ocupado</div>
        <div style="color: var(--text-secondary); font-size: 0.75rem;">(No disponible)</div>
      `;
    } else {
      tooltip.innerHTML = `<strong>🟢 Número #${i} Disponible</strong> (Clic para elegir)`;
    }

    seatEl.appendChild(tooltip);
    seatEl.addEventListener('click', () => handleSeatClick(i, isMine, isOccupied));

    seatsGrid.appendChild(seatEl);
  }
}

// -------------------------------------------------------------------
// 5. Selección Directa en Supabase (Garantizada con REST)
// -------------------------------------------------------------------
async function handleSeatClick(seatNumber, isMine, isOccupied) {
  if (!state || !state.user || !state.user.is_logged_in) {
    window.soundFX?.playError();
    openLoginModal();
    return;
  }

  if (isOccupied && !isMine) {
    window.soundFX?.playError();
    showToast(`El número #${seatNumber} ya está ocupado por otro participante.`, true);
    return;
  }

  if (!isMine && state.user.available_tickets <= 0) {
    window.soundFX?.playError();
    showToast(`No tienes tickets disponibles para el número #${seatNumber}. ¡Regala o compra una Sub en el canal de Kick para conseguir más!`, true);
    return;
  }

  try {
    if (isMine) {
      await supabaseRest('seats', 'DELETE', null, `seat_number=eq.${seatNumber}`);
      window.soundFX?.playSeatRelease();
      showToast(`Número #${seatNumber} liberado.`);
    } else {
      await supabaseRest('seats', 'POST', {
        seat_number: seatNumber,
        username: state.user.username,
        avatar_url: state.user.avatar,
        claimed_at: new Date().toISOString()
      });
      window.soundFX?.playSeatClick();
      showToast(`¡Número #${seatNumber} seleccionado con éxito! 🎟️`);
    }

    await loadState();
  } catch (err) {
    console.error('Error modificando número en Supabase:', err);
    window.soundFX?.playError();
    showToast('Error al actualizar número en la base de datos', true);
  }
}

// -------------------------------------------------------------------
// 6. Auto-Pick Directo en Supabase
// -------------------------------------------------------------------
async function handleAutoPick() {
  if (!state || !state.user || !state.user.is_logged_in || state.user.available_tickets <= 0) {
    showToast('No tienes tickets disponibles para auto-elegir', true);
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
      showToast('¡Todos los números han sido elegidos!', true);
      return;
    }

    const countToPick = Math.min(state.user.available_tickets, freeSeats.length);
    const shuffled = freeSeats.sort(() => 0.5 - Math.random());
    const chosen = shuffled.slice(0, countToPick);

    const inserts = chosen.map((num) => ({
      seat_number: num,
      username: state.user.username,
      avatar_url: state.user.avatar,
      claimed_at: new Date().toISOString()
    }));

    await supabaseRest('seats', 'POST', inserts);

    window.soundFX?.playSuccessChime();
    if (typeof confetti === 'function') {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }

    showToast(`🎉 ¡Auto-asignados ${chosen.length} números: ${chosen.join(', ')}!`);
    await loadState();
  } catch (err) {
    console.error('Error en Auto-Pick:', err);
    window.soundFX?.playError();
    showToast('Error en auto-asignación', true);
  }
}

// -------------------------------------------------------------------
// 7. Autenticación Kick Manual de Respaldo
// -------------------------------------------------------------------
function openLoginModal() {
  if (loginModal) {
    loginModal.style.display = 'flex';
    if (kickUsernameInput) kickUsernameInput.focus();
  }
}

function closeModal() {
  if (loginModal) {
    loginModal.style.display = 'none';
    if (kickUsernameInput) kickUsernameInput.value = '';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  if (!kickUsernameInput) return;
  const username = kickUsernameInput.value.trim().replace(/^@/, '');
  if (!username) return;

  localStorage.setItem('kick_user', username);
  localStorage.setItem('kick_avatar', `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`);

  closeModal();
  window.soundFX?.playSuccessChime();
  showToast(`¡Bienvenido al Sorteo, @${username}!`);

  await loadState();
}

function handleLogout() {
  localStorage.removeItem('kick_user');
  localStorage.removeItem('kick_avatar');
  window.location.reload();
}

// -------------------------------------------------------------------
// 8. Realtime Polling Seguro con Supabase REST
// -------------------------------------------------------------------
function initSupabaseRealtime() {
  setInterval(() => {
    loadState();
  }, 5000);
}

// -------------------------------------------------------------------
// 9. Toasts & Helper
// -------------------------------------------------------------------
function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `
    <span style="font-size: 1.2rem;">${isError ? '⚠️' : '🎉'}</span>
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
// 9. Navbar Inteligente (Auto-Hide al Scroll) y Menú de Usuario
// -------------------------------------------------------------------
function initNavbarLogic() {
  const navbar = document.getElementById('mainNavbar');
  const userPill = document.getElementById('userPillBox');
  const userDropdown = document.getElementById('userDropdownMenu');
  const userPillContainer = document.getElementById('userPillContainer');
  const logoutBtnElem = document.getElementById('logoutBtn');

  // 1. Auto-Hide Navbar al hacer scroll hacia abajo, mostrar al hacer scroll hacia arriba
  let lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
        if (!navbar) return;

        // Si estamos cerca del tope, siempre visible
        if (currentScrollY <= 80) {
          navbar.classList.remove('navbar-hidden');
        } else if (currentScrollY > lastScrollY + 6) {
          // Scroll hacia abajo -> Ocultar navbar y cerrar dropdown
          navbar.classList.add('navbar-hidden');
          if (userDropdown) userDropdown.classList.remove('active');
          if (userPillContainer) userPillContainer.classList.remove('open');
        } else if (currentScrollY < lastScrollY - 6) {
          // Scroll hacia arriba -> Mostrar navbar
          navbar.classList.remove('navbar-hidden');
        }

        lastScrollY = Math.max(0, currentScrollY);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // 2. Toggle User Dropdown Menu al hacer clic en el pill de usuario
  if (userPill && userDropdown) {
    userPill.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = userDropdown.classList.toggle('active');
      if (userPillContainer) {
        userPillContainer.classList.toggle('open', isActive);
      }
      if (typeof soundFX !== 'undefined' && soundFX.playPop) {
        soundFX.playPop();
      }
    });

    // Cerrar menú al hacer clic en cualquier enlace del dropdown
    const dropdownLinks = userDropdown.querySelectorAll('.dropdown-item:not(#logoutBtn)');
    dropdownLinks.forEach((link) => {
      link.addEventListener('click', () => {
        userDropdown.classList.remove('active');
        if (userPillContainer) userPillContainer.classList.remove('open');
      });
    });

    // Cerrar menú al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target) && !userPill.contains(e.target)) {
        userDropdown.classList.remove('active');
        if (userPillContainer) userPillContainer.classList.remove('open');
      }
    });
  }

  // 3. Botón de Salir / Logout funcional en móviles y PC
  if (logoutBtnElem) {
    logoutBtnElem.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (userDropdown) userDropdown.classList.remove('active');
      if (userPillContainer) userPillContainer.classList.remove('open');
      await handleLogout();
    });
  }
}

async function handleLogout() {
  try {
    localStorage.removeItem('kick_user');
    showToast('Has cerrado sesión correctamente.');
    if (typeof soundFX !== 'undefined' && soundFX.playPop) {
      soundFX.playPop();
    }
    await loadState();
  } catch (err) {
    console.error('Error en logout:', err);
    location.reload();
  }
}

// -------------------------------------------------------------------
// 10. Animación de Máscara y Video al Scroll (GSAP matchMedia Responsive)
// -------------------------------------------------------------------
let caozMatchMedia = null;

function initHeroScrollAnimation() {
  const introSection = document.getElementById('heroIntroSection');
  const maskWrapper = document.getElementById('caozMaskWrapper');
  const mainSite = document.getElementById('mainSiteContent');
  const bgVideo = document.getElementById('heroBgVideo');
  if (!introSection || !maskWrapper || !bgVideo) return;

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('GSAP o ScrollTrigger no se encuentran cargados.');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  if (typeof ScrollTrigger.clearScrollMemory === 'function') {
    ScrollTrigger.clearScrollMemory('manual');
  }

  // Revertir instancia previa si existía
  if (caozMatchMedia) {
    caozMatchMedia.revert();
    caozMatchMedia = null;
  }

  caozMatchMedia = gsap.matchMedia();

  // Función constructora limpia para cada breakpoint (desktop vs mobile)
  const buildTimeline = (isMobile) => {
    // 1. Resetear video
    if (bgVideo) {
      bgVideo.pause();
      bgVideo.currentTime = 0;
    }

    // 2. Parámetros exactos según resolución
    const isTablet = window.innerWidth <= 1024 && !isMobile;
    const maskUrl = isMobile ? 'url("images/mask-caoz-mobile.svg")' : 'url("images/mask-caoz-desktop.svg")';
    maskWrapper.style.webkitMaskImage = maskUrl;
    maskWrapper.style.maskImage = maskUrl;

    const initialPosX = isMobile ? 35.7 : 38.5;
    const initialPosY = 50.0;
    const initialSize = isMobile ? 1000 : 1300;

    const targetPosX = 50.0;
    const targetPosY = isMobile ? 48.0 : 50.0;
    const targetSize = isMobile ? 46 : (isTablet ? 34 : 24);

    const maskState = {
      size: initialSize,
      posX: initialPosX,
      posY: initialPosY
    };

    const updateMask = () => {
      const sizeVal = `${maskState.size}% ${maskState.size}%`;
      const posVal = `${maskState.posX}% ${maskState.posY}%`;
      maskWrapper.style.webkitMaskSize = sizeVal;
      maskWrapper.style.maskSize = sizeVal;
      maskWrapper.style.webkitMaskPosition = posVal;
      maskWrapper.style.maskPosition = posVal;
    };
    updateMask();

    gsap.set(maskWrapper, { opacity: 1 });
    gsap.set('.fade-out', { opacity: 1 });
    gsap.set('.scale-out', { scale: 1.0 });

    let targetTime = 0;
    let isSeeking = false;

    // Decodificación por hardware no bloqueante para móviles
    const onSeekFrame = () => {
      if (bgVideo && isFinite(targetTime) && !isSeeking) {
        const threshold = isMobile ? 0.035 : 0.015;
        if (Math.abs(bgVideo.currentTime - targetTime) > threshold) {
          isSeeking = true;
          bgVideo.currentTime = targetTime;
        }
      }
    };

    bgVideo.onseeked = () => {
      isSeeking = false;
    };

    const totalDur = (bgVideo && bgVideo.duration > 0) ? bgVideo.duration : 3.0;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#heroIntroSection',
        start: 'top top',
        end: isMobile ? '+=160%' : '+=200%',
        scrub: isMobile ? 0.8 : 1.0,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const dur = (bgVideo && bgVideo.duration > 0) ? bgVideo.duration : totalDur;
          const videoProgress = Math.min(1, self.progress / 0.60);
          targetTime = Math.min(Math.max(0, dur - 0.03), videoProgress * dur);
          requestAnimationFrame(onSeekFrame);
        }
      }
    });

    // 1. Flecha de scroll se desvanece
    tl.to('.fade-out', {
      opacity: 0,
      duration: 0.25,
      ease: 'power1.out'
    }, 0);

    // 2. Zoom OUT de la máscara CAOZ
    tl.to(maskState, {
      size: targetSize,
      posX: targetPosX,
      posY: targetPosY,
      duration: 0.35,
      ease: 'power1.inOut',
      onUpdate: updateMask
    }, 0.50);

    // 3. Transición suave a la web
    tl.to(maskWrapper, {
      opacity: 0,
      duration: 0.20,
      ease: 'power1.inOut'
    }, 0.80);

    // 4. El contenido de la web emerge en paralelo
    if (mainSite) {
      tl.fromTo(mainSite, 
        { opacity: 0.4, y: 15 },
        { opacity: 1, y: 0, duration: 0.20, ease: 'power1.inOut' },
        0.80
      );
    }

    // Limpieza automática al cambiar de breakpoint (elimina pin-spacer sin dejar bugs)
    return () => {
      if (tl.scrollTrigger) {
        tl.scrollTrigger.kill(true);
      }
      tl.kill();
      gsap.set([maskWrapper, introSection, mainSite, '.fade-out', '.scale-out'], { clearProps: 'all' });
      if (bgVideo) {
        bgVideo.onseeked = null;
      }
    };
  };

  // ESCRITORIO Y TABLET (> 768px)
  caozMatchMedia.add("(min-width: 769px)", () => {
    return buildTimeline(false);
  });

  // MÓVIL (<= 768px)
  caozMatchMedia.add("(max-width: 768px)", () => {
    return buildTimeline(true);
  });

  // Refrescar al cargar metadata del video
  if (bgVideo.readyState < 1) {
    bgVideo.addEventListener('loadedmetadata', () => {
      ScrollTrigger.refresh();
    }, { once: true });
  }

  const scrollIndicator = document.getElementById('heroScrollIndicator');
  if (scrollIndicator) {
    scrollIndicator.addEventListener('click', () => {
      window.scrollTo({
        top: window.innerHeight * 1.5,
        behavior: 'smooth'
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Iniciar Navbar Inteligente (Auto-Hide y Menú de Usuario)
  initNavbarLogic();

  // Iniciar Animación de Zoom Out de la Máscara y Video Scroll
  initHeroScrollAnimation();

  // 1. Procesar retorno de Kick OAuth si viene con ?code=...
  if (typeof processKickOAuthCallback === 'function') {
    const oauthUser = await processKickOAuthCallback();
    if (oauthUser) {
      showToast(`¡Bienvenido @${oauthUser.username}!`);
      window.soundFX?.playSuccessChime();
      if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }
      await loadState();
    }
  }

  // 2. Cargar Estado y Supabase Realtime
  loadState();
  initSupabaseRealtime();

  if (autoPickBtn) autoPickBtn.addEventListener('click', handleAutoPick);
  if (floatingAutoPickBtn) floatingAutoPickBtn.addEventListener('click', handleAutoPick);

  // Iniciar Kick OAuth 2.0 oficial directamente al hacer clic
  const handleKickLoginClick = () => {
    if (typeof startKickOAuth === 'function') {
      startKickOAuth();
    } else {
      openLoginModal();
    }
  };

  if (navLoginBtn) navLoginBtn.addEventListener('click', handleKickLoginClick);
  if (walletLoginBtn) walletLoginBtn.addEventListener('click', handleKickLoginClick);
  if (lockedLoginBtn) lockedLoginBtn.addEventListener('click', handleKickLoginClick);

  if (closeLoginModal) closeLoginModal.addEventListener('click', closeModal);
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) closeModal();
    });
  }

  if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  const walletLogoutBtn = document.getElementById('walletLogoutBtn');
  if (walletLogoutBtn) walletLogoutBtn.addEventListener('click', handleLogout);

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderUI();
    });
  });

  if (searchSeatInput) {
    searchSeatInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderUI();
    });
  }

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
