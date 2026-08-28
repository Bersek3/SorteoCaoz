// Lógica del Panel de Streamer (Admin) - Conectado Directo a Supabase Cloud
let adminState = null;

// Elementos DOM
const adminTotalSeats = document.getElementById('adminTotalSeats');
const adminOccupiedSeats = document.getElementById('adminOccupiedSeats');
const adminOccupancyPercent = document.getElementById('adminOccupancyPercent');
const adminTotalParticipants = document.getElementById('adminTotalParticipants');

const simUsername = document.getElementById('simUsername');
const simEventType = document.getElementById('simEventType');
const emitEventBtn = document.getElementById('emitEventBtn');

const configTitle = document.getElementById('configTitle');
const configPrize = document.getElementById('configPrize');
const configTotalSeats = document.getElementById('configTotalSeats');
const configLocked = document.getElementById('configLocked');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const resetGiveawayBtn = document.getElementById('resetGiveawayBtn');

const usersTableBody = document.getElementById('usersTableBody');
const searchUserTable = document.getElementById('searchUserTable');
const dbStatusBadge = document.getElementById('dbStatusBadge');
const oauthStatusBadge = document.getElementById('oauthStatusBadge');

async function loadAdminData() {
  if (!supabaseClient) {
    alert('Error al conectar con Supabase Cloud.');
    return;
  }

  const currentUser = localStorage.getItem('kick_user');
  const role = (typeof checkUserRole === 'function') 
    ? checkUserRole(currentUser)
    : { is_admin: ['bersek', 'caoz'].includes((currentUser || '').toLowerCase()) };

  if (!role.is_admin) {
    alert('Acceso no autorizado. Debes iniciar sesión con tu cuenta de Kick (@Caoz o @Bersek).');
    window.location.href = 'index.html';
    return;
  }

  try {
    const [configRes, seatsRes, profilesRes] = await Promise.all([
      supabaseClient.from('giveaway_config').select('*').eq('id', 'current').single(),
      supabaseClient.from('seats').select('*'),
      supabaseClient.from('profiles').select('*')
    ]);

    const config = configRes.data || {
      title: 'Sorteo Oficial PlayStation 5 🎮',
      prize: 'PlayStation 5 Slim (Edición Disco)',
      total_seats: 200,
      is_locked: false
    };

    const seats = seatsRes.data || [];
    const profiles = profilesRes.data || [];

    // Mapear asientos por usuario
    const userSeatsMap = {};
    seats.forEach((s) => {
      const u = s.username.toLowerCase();
      if (!userSeatsMap[u]) userSeatsMap[u] = [];
      userSeatsMap[u].push(s.seat_number);
    });

    const totalSeats = config.total_seats || 200;
    const occupiedCount = seats.length;

    const allUsersList = profiles.map((p) => {
      const mySeats = userSeatsMap[p.username.toLowerCase()] || [];
      const totalTickets = p.total_tickets ?? ((p.own_subs || 0) + (p.gifted_subs || 0) + (p.bonus_tickets || 0));
      return {
        username: p.username,
        display_name: p.display_name || p.username,
        avatar: p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.username}`,
        own_subs: p.own_subs || 0,
        gifted_subs: p.gifted_subs || 0,
        total_tickets: totalTickets,
        used_tickets: mySeats.length,
        seats: mySeats
      };
    });

    adminState = {
      config,
      stats: {
        total_seats: totalSeats,
        occupied_seats: occupiedCount,
        occupancy_percent: Math.round((occupiedCount / totalSeats) * 100),
        total_participants: profiles.length
      },
      all_users_list: allUsersList
    };

    renderAdminUI();
  } catch (err) {
    console.error('Error in loadAdminData:', err);
    showToast('Error conectando a Supabase', true);
  }
}

function renderAdminUI() {
  if (!adminState) return;

  const { config, stats, all_users_list } = adminState;

  if (dbStatusBadge) {
    dbStatusBadge.textContent = 'Supabase Cloud (Conectado)';
    dbStatusBadge.style.color = 'var(--kick-green)';
  }
  if (oauthStatusBadge) {
    oauthStatusBadge.textContent = 'GitHub Pages Serverless';
    oauthStatusBadge.style.color = 'var(--cyan-accent)';
  }

  adminTotalSeats.textContent = stats.total_seats;
  adminOccupiedSeats.textContent = stats.occupied_seats;
  adminOccupancyPercent.textContent = `${stats.occupancy_percent}%`;
  adminTotalParticipants.textContent = stats.total_participants;

  configTitle.value = config.title || '';
  configPrize.value = config.prize || '';
  configTotalSeats.value = String(config.total_seats || 200);
  configLocked.value = config.is_locked ? 'true' : 'false';

  renderUsersTable(all_users_list || []);
}

function renderUsersTable(users) {
  usersTableBody.innerHTML = '';
  const filter = searchUserTable.value.trim().toLowerCase();

  if (!users || users.length === 0) {
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 24px;">
          Aún no hay participantes registrados en Supabase.
        </td>
      </tr>
    `;
    return;
  }

  users.forEach((user) => {
    if (filter && !user.username.toLowerCase().includes(filter)) return;

    const tr = document.createElement('tr');
    const freeTickets = Math.max(0, user.total_tickets - user.used_tickets);
    const seatsListStr = user.seats.length > 0 ? user.seats.join(', ') : 'Ninguno';

    tr.innerHTML = `
      <td>
        <div class="user-cell">
          <img src="${user.avatar}" alt="${user.username}">
          <div>
            <div>@${user.username}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${user.display_name || user.username}</div>
          </div>
        </div>
      </td>
      <td><span class="tag-badge tag-cyan">${user.own_subs || 0}</span></td>
      <td><span class="tag-badge tag-green">${user.gifted_subs || 0}</span></td>
      <td><strong style="color: var(--kick-green); font-size: 1rem;">${user.total_tickets}</strong></td>
      <td>
        <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary);">
          ${seatsListStr}
        </span>
      </td>
      <td>
        <span class="tag-badge ${freeTickets > 0 ? 'tag-green' : ''}">
          ${freeTickets} Libres
        </span>
      </td>
      <td>
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" onclick="addTicketToUser('${user.username}', 1)">
          +1 Ticket Bonus
        </button>
      </td>
    `;
    usersTableBody.appendChild(tr);
  });
}

// -------------------------------------------------------------------
// Acciones Directas en Supabase
// -------------------------------------------------------------------
async function handleEmitEvent() {
  const username = simUsername.value.trim();
  const eventType = simEventType.value;

  if (!username) {
    showToast('Por favor escribe un nombre de usuario de Kick', true);
    return;
  }

  try {
    emitEventBtn.disabled = true;
    emitEventBtn.textContent = 'Guardando en Supabase...';

    // Buscar perfil existente en Supabase
    const { data: existing } = await supabaseClient
      .from('profiles')
      .select('*')
      .ilike('username', username)
      .maybeSingle();

    const count = eventType.startsWith('gift_sub') ? parseInt(eventType.split('_')[2], 10) : 1;

    if (existing) {
      if (eventType.startsWith('gift_sub')) {
        await supabaseClient.from('profiles').update({
          gifted_subs: (existing.gifted_subs || 0) + count
        }).eq('id', existing.id);
      } else {
        await supabaseClient.from('profiles').update({
          own_subs: (existing.own_subs || 0) + 1
        }).eq('id', existing.id);
      }
    } else {
      await supabaseClient.from('profiles').insert({
        kick_user_id: String(Math.floor(Math.random() * 10000000)),
        username: username,
        display_name: username,
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
        own_subs: eventType.startsWith('gift_sub') ? 0 : 1,
        gifted_subs: eventType.startsWith('gift_sub') ? count : 0,
        bonus_tickets: 0
      });
    }

    window.soundFX.playSuccessChime();
    showToast(`¡Evento registrado en Supabase para @${username}!`);
    await loadAdminData();

  } catch (err) {
    window.soundFX.playError();
    showToast('Error registrando evento en Supabase', true);
  } finally {
    emitEventBtn.disabled = false;
    emitEventBtn.textContent = '🚀 Emitir Evento en Tiempo Real';
  }
}

async function handleSaveConfig() {
  try {
    saveConfigBtn.disabled = true;
    const { error } = await supabaseClient.from('giveaway_config').update({
      title: configTitle.value.trim(),
      prize: configPrize.value.trim(),
      total_seats: parseInt(configTotalSeats.value, 10),
      is_locked: configLocked.value === 'true',
      updated_at: new Date().toISOString()
    }).eq('id', 'current');

    if (error) throw error;

    showToast('¡Configuración guardada directamente en Supabase!');
    window.soundFX.playSuccessChime();
    await loadAdminData();

  } catch (err) {
    showToast('Error al guardar configuración', true);
  } finally {
    saveConfigBtn.disabled = false;
  }
}

async function handleResetGiveaway() {
  if (!confirm('¿Estás seguro de que deseas vaciar todos los asientos reservados de la sala?')) {
    return;
  }

  try {
    await supabaseClient.from('seats').delete().neq('seat_number', 0);
    showToast('Sala de sorteo vaciada en Supabase.');
    await loadAdminData();
  } catch (err) {
    showToast('Error al reiniciar asientos', true);
  }
}

window.addTicketToUser = async function(username, count) {
  try {
    const { data: existing } = await supabaseClient
      .from('profiles')
      .select('*')
      .ilike('username', username)
      .single();

    if (existing) {
      await supabaseClient.from('profiles').update({
        bonus_tickets: (existing.bonus_tickets || 0) + count
      }).eq('id', existing.id);
      showToast(`+${count} Ticket bonus añadido a @${username}`);
      await loadAdminData();
    }
  } catch (err) {
    showToast('Error añadiendo bonus', true);
  }
};

function initSupabaseRealtime() {
  if (!supabaseClient) return;
  supabaseClient
    .channel('admin_live_sync')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      loadAdminData();
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

document.addEventListener('DOMContentLoaded', () => {
  loadAdminData();
  initSupabaseRealtime();

  emitEventBtn.addEventListener('click', handleEmitEvent);
  saveConfigBtn.addEventListener('click', handleSaveConfig);
  resetGiveawayBtn.addEventListener('click', handleResetGiveaway);
  searchUserTable.addEventListener('input', () => {
    if (adminState) renderUsersTable(adminState.all_users_list);
  });
});
