// Lógica del Panel de Streamer (Admin) - Conectado Directo a Supabase Cloud & Google Drive
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
const configDateOnly = document.getElementById('configDateOnly');
const configTimeOnly = document.getElementById('configTimeOnly');

const saveConfigBtn = document.getElementById('saveConfigBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');

// Google Sheets / Drive Sync Elements
const googleSheetWebhookUrl = document.getElementById('googleSheetWebhookUrl');
const saveSheetUrlBtn = document.getElementById('saveSheetUrlBtn');
const syncGoogleSheetsBtn = document.getElementById('syncGoogleSheetsBtn');
const helpDriveModalBtn = document.getElementById('helpDriveModalBtn');
const driveModal = document.getElementById('driveModal');
const closeDriveModal = document.getElementById('closeDriveModal');

const usersTableBody = document.getElementById('usersTableBody');
const searchUserTable = document.getElementById('searchUserTable');

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
      is_locked: false,
      drawn_at: null
    };

    const seats = seatsRes.data || [];
    const profiles = profilesRes.data || [];

    // Mapear números elegidos por usuario
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

  adminTotalSeats.textContent = stats.total_seats;
  adminOccupiedSeats.textContent = stats.occupied_seats;
  adminOccupancyPercent.textContent = `${stats.occupancy_percent}%`;
  adminTotalParticipants.textContent = stats.total_participants;

  configTitle.value = config.title || '';
  configPrize.value = config.prize || '';
  configTotalSeats.value = String(config.total_seats || 200);
  configLocked.value = config.is_locked ? 'true' : 'false';

  // Cargar URL guardada de Google Sheets
  const savedSheetUrl = localStorage.getItem('google_sheet_webhook_url') || '';
  if (googleSheetWebhookUrl && !googleSheetWebhookUrl.value) {
    googleSheetWebhookUrl.value = savedSheetUrl;
  }

  // Configuración del Selector de Fecha Interactiva (Calendario)
  const todayStr = new Date().toISOString().split('T')[0];
  if (configDateOnly) {
    configDateOnly.min = todayStr;
  }

  const savedDateIso = config.drawn_at || config.broadcaster_id || config.draw_date;
  if (savedDateIso) {
    const dt = new Date(savedDateIso);
    if (!isNaN(dt.getTime())) {
      const localDate = new Date(dt.getTime() - (dt.getTimezoneOffset() * 60000));
      if (configDateOnly) configDateOnly.value = localDate.toISOString().split('T')[0];
      if (configTimeOnly) configTimeOnly.value = localDate.toISOString().split('T')[1].slice(0, 5);
    }
  } else {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    if (configDateOnly && !configDateOnly.value) configDateOnly.value = defaultDate.toISOString().split('T')[0];
    if (configTimeOnly && !configTimeOnly.value) configTimeOnly.value = '21:00';
  }

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

    const dateVal = configDateOnly ? configDateOnly.value : '';
    const timeVal = (configTimeOnly && configTimeOnly.value) ? configTimeOnly.value : '21:00';

    if (!dateVal) {
      showToast('⚠️ Por favor selecciona una fecha en el calendario.', true);
      saveConfigBtn.disabled = false;
      return;
    }

    const selectedDateTime = new Date(`${dateVal}T${timeVal}`);
    const now = new Date();

    if (selectedDateTime.getTime() <= now.getTime()) {
      window.soundFX.playError();
      showToast('⚠️ La fecha del sorteo no puede ser anterior ni igual al momento actual.', true);
      saveConfigBtn.disabled = false;
      return;
    }

    const drawDateIso = selectedDateTime.toISOString();

    const { error } = await supabaseClient.from('giveaway_config').update({
      title: configTitle.value.trim(),
      prize: configPrize.value.trim(),
      total_seats: parseInt(configTotalSeats.value, 10),
      is_locked: configLocked.value === 'true',
      drawn_at: drawDateIso,
      broadcaster_id: drawDateIso,
      updated_at: new Date().toISOString()
    }).eq('id', 'current');

    if (error) throw error;

    showToast('¡Fecha y configuración guardadas con éxito!');
    window.soundFX.playSuccessChime();
    await loadAdminData();

  } catch (err) {
    console.error('Error al guardar configuración:', err);
    showToast('Error al guardar configuración en la base de datos', true);
  } finally {
    saveConfigBtn.disabled = false;
  }
}

// -------------------------------------------------------------------
// 1. Exportación Local a Excel / CSV (1 Clic)
// -------------------------------------------------------------------
function exportToExcel() {
  if (!adminState || !adminState.all_users_list || adminState.all_users_list.length === 0) {
    showToast('No hay participantes registrados para exportar.', true);
    return;
  }

  const users = adminState.all_users_list;
  let csvContent = '\uFEFF';
  csvContent += 'Usuario Kick;Nombre Visible;Subs Propias;Subs Regaladas;Tickets Bonus;Total Tickets;Numeros Elegidos;Cantidad Asignada;Tickets Libres;Fecha Exportacion\r\n';

  const exportTime = new Date().toLocaleString('es-ES');

  users.forEach((u) => {
    const freeTickets = Math.max(0, u.total_tickets - u.used_tickets);
    const seatsStr = u.seats.length > 0 ? `"${u.seats.join(', ')}"` : 'Ninguno';
    const bonus = Math.max(0, (u.total_tickets - (u.own_subs || 0) - (u.gifted_subs || 0)));

    const row = [
      `@${u.username}`,
      `"${(u.display_name || u.username).replace(/"/g, '""')}"`,
      u.own_subs || 0,
      u.gifted_subs || 0,
      bonus,
      u.total_tickets,
      seatsStr,
      u.seats.length,
      freeTickets,
      `"${exportTime}"`
    ];
    csvContent += row.join(';') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute('download', `Sorteo_Caoz_Participantes_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('📊 ¡Planilla Excel (.csv) descargada con éxito!');
  window.soundFX?.playSuccessChime();
}

// -------------------------------------------------------------------
// 2. Sincronización Remota con Google Sheets (Google Drive)
// -------------------------------------------------------------------
async function syncWithGoogleDrive() {
  const url = googleSheetWebhookUrl.value.trim();

  if (!url) {
    showToast('⚠️ Por favor ingresa la URL de tu Google Apps Script de Drive.', true);
    googleSheetWebhookUrl.focus();
    return;
  }

  if (!adminState || !adminState.all_users_list || adminState.all_users_list.length === 0) {
    showToast('No hay participantes registrados para sincronizar aún.', true);
    return;
  }

  try {
    syncGoogleSheetsBtn.disabled = true;
    syncGoogleSheetsBtn.textContent = '⏳ Sincronizando con Google Drive...';

    localStorage.setItem('google_sheet_webhook_url', url);

    const payload = {
      giveaway_title: adminState?.config?.title || 'Sorteo PlayStation 5',
      prize: adminState?.config?.prize || 'PS5',
      exported_at: new Date().toLocaleString('es-ES'),
      participants: adminState.all_users_list.map((u) => ({
        username: `@${u.username}`,
        display_name: u.display_name || u.username,
        own_subs: u.own_subs || 0,
        gifted_subs: u.gifted_subs || 0,
        bonus_tickets: Math.max(0, (u.total_tickets - (u.own_subs || 0) - (u.gifted_subs || 0))),
        total_tickets: u.total_tickets,
        seats_str: u.seats.length > 0 ? u.seats.join(', ') : 'Ninguno',
        seats_count: u.seats.length,
        free_tickets: Math.max(0, u.total_tickets - u.used_tickets)
      }))
    };

    // Envío directo a Google Apps Script Webhook
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    showToast('📊 ¡Planilla en Google Drive sincronizada en tiempo real!');
    window.soundFX?.playSuccessChime();

  } catch (err) {
    console.error('Error al sincronizar con Google Drive:', err);
    showToast('Error al conectar con Google Sheets Webhook', true);
  } finally {
    syncGoogleSheetsBtn.disabled = false;
    syncGoogleSheetsBtn.textContent = '🚀 Sincronizar Ahora con Drive';
  }
}

function handleSaveSheetUrl() {
  const url = googleSheetWebhookUrl.value.trim();
  if (!url) {
    showToast('Por favor escribe la URL de tu Google Apps Script', true);
    return;
  }
  localStorage.setItem('google_sheet_webhook_url', url);
  showToast('💾 URL de Google Sheets guardada en el navegador.');
  window.soundFX?.playSuccessChime();
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

function handleLogout() {
  localStorage.removeItem('kick_user');
  localStorage.removeItem('kick_avatar');
  window.location.href = 'index.html';
}

function initSupabaseRealtime() {
  setInterval(() => {
    loadAdminData();
  }, 6000);
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
  if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportToExcel);
  if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', handleLogout);

  if (saveSheetUrlBtn) saveSheetUrlBtn.addEventListener('click', handleSaveSheetUrl);
  if (syncGoogleSheetsBtn) syncGoogleSheetsBtn.addEventListener('click', syncWithGoogleDrive);
  if (helpDriveModalBtn) helpDriveModalBtn.addEventListener('click', () => { driveModal.style.display = 'flex'; });
  if (closeDriveModal) closeDriveModal.addEventListener('click', () => { driveModal.style.display = 'none'; });

  searchUserTable.addEventListener('input', () => {
    if (adminState) renderUsersTable(adminState.all_users_list);
  });
});
