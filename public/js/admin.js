// Lógica del Panel de Streamer (Admin) - Protegido por Roles
let adminState = null;
let ws = null;

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
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Error al cargar datos');
    adminState = await res.json();

    // Verificación de Seguridad en Frontend
    if (!adminState.user || !adminState.user.is_admin) {
      alert('Acceso no autorizado. Debes iniciar sesión con la cuenta de Kick del streamer (@Caoz) o un moderador.');
      window.location.href = '/';
      return;
    }

    renderAdminUI();
  } catch (err) {
    console.error('Error in loadAdminData:', err);
    showToast('Error conectando al servidor', true);
  }
}

function renderAdminUI() {
  if (!adminState) return;

  const { config, stats, all_users_list, has_supabase, has_kick_oauth } = adminState;

  // Badges de Integración
  if (dbStatusBadge) {
    dbStatusBadge.textContent = has_supabase ? 'Supabase Cloud (Conectado)' : 'Almacenamiento Local';
    dbStatusBadge.style.color = has_supabase ? 'var(--kick-green)' : 'var(--cyan-accent)';
  }
  if (oauthStatusBadge) {
    oauthStatusBadge.textContent = has_kick_oauth ? 'Kick OAuth 2.0 PKCE (Activo)' : 'Modo Desarrollo';
    oauthStatusBadge.style.color = has_kick_oauth ? 'var(--kick-green)' : 'var(--cyan-accent)';
  }

  // Métricas
  adminTotalSeats.textContent = stats.total_seats;
  adminOccupiedSeats.textContent = stats.occupied_seats;
  adminOccupancyPercent.textContent = `${stats.occupancy_percent}%`;
  adminTotalParticipants.textContent = stats.total_participants;

  // Configuración
  configTitle.value = config.title || '';
  configPrize.value = config.prize || '';
  configTotalSeats.value = String(config.total_seats || 200);
  configLocked.value = config.is_locked ? 'true' : 'false';

  // Tabla de usuarios
  renderUsersTable(all_users_list || []);
}

function renderUsersTable(users) {
  usersTableBody.innerHTML = '';
  const filter = searchUserTable.value.trim().toLowerCase();

  if (!users || users.length === 0) {
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 24px;">
          Aún no hay participantes registrados. Las suscripciones en Kick aparecerán aquí automáticamente.
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
// Acciones del Admin
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
    emitEventBtn.textContent = 'Enviando...';

    const res = await fetch('/api/admin/simulate-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        event_type: eventType,
        count: eventType.startsWith('gift_sub') ? parseInt(eventType.split('_')[2], 10) : 1
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error');

    window.soundFX.playSuccessChime();
    showToast(data.message);
    await loadAdminData();

  } catch (err) {
    window.soundFX.playError();
    showToast(err.message, true);
  } finally {
    emitEventBtn.disabled = false;
    emitEventBtn.textContent = '🚀 Emitir Evento en Tiempo Real';
  }
}

async function handleSaveConfig() {
  try {
    saveConfigBtn.disabled = true;
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: configTitle.value.trim(),
        prize: configPrize.value.trim(),
        total_seats: parseInt(configTotalSeats.value, 10),
        is_locked: configLocked.value === 'true'
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al guardar configuración');

    showToast('¡Configuración guardada en Supabase!');
    window.soundFX.playSuccessChime();
    await loadAdminData();

  } catch (err) {
    showToast(err.message, true);
  } finally {
    saveConfigBtn.disabled = false;
  }
}

async function handleResetGiveaway() {
  if (!confirm('¿Estás seguro de que deseas vaciar todos los asientos reservados de la sala?')) {
    return;
  }

  try {
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al reiniciar');

    showToast('Sala de sorteo vaciada con éxito.');
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
}

window.addTicketToUser = async function(username, count) {
  try {
    const res = await fetch('/api/admin/simulate-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        event_type: 'manual_bonus',
        count: count
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error');
    showToast(`Se añadió +${count} ticket bonus a @${username}`);
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
};

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);
  ws.onmessage = () => loadAdminData();
  ws.onclose = () => setTimeout(initWebSocket, 3000);
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
  initWebSocket();

  emitEventBtn.addEventListener('click', handleEmitEvent);
  saveConfigBtn.addEventListener('click', handleSaveConfig);
  resetGiveawayBtn.addEventListener('click', handleResetGiveaway);
  searchUserTable.addEventListener('input', () => {
    if (adminState) renderUsersTable(adminState.all_users_list);
  });
});
