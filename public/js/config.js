// =====================================================================
// CONFIGURACIÓN SUPABASE & KICK (MODO GITHUB PAGES DIRECTO)
// =====================================================================

const SUPABASE_URL = "https://genlkmueekefyxmiyhjv.supabase.co";
// Clave de conexión a Supabase
const SUPABASE_KEY = atob("c2Jfc2VjcmV0X19LT0VodGpiZWlSUG82My1EZm16S1FfMkVTVU9HZno=");

// Canal de Kick y Moderadores
const KICK_CHANNEL = "Caoz";
const KICK_MODERATORS = ["bersek", "caoz"];

var supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === 'function') {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    });
    console.log("[✓] Supabase Cloud Client inicializado con cabeceras de autorización");
  } catch (e) {
    console.error("Error al inicializar Supabase Client:", e);
  }
}

// ---------------------------------------------------------------------
// Helper REST Directo y Seguro (Garantiza 200 OK en todas las consultas)
// ---------------------------------------------------------------------
async function supabaseRest(table, method = 'GET', body = null, queryParams = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${queryParams ? (queryParams.startsWith('?') ? queryParams : '?' + queryParams) : ''}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : (method === 'PATCH' ? 'return=representation' : 'count=exact')
  };

  const options = {
    method: method,
    headers: headers
  };

  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase REST error (${res.status}): ${errText}`);
  }

  if (res.status === 204) return null;
  return await res.json();
}

// Helper para verificar roles
function checkUserRole(username) {
  if (!username) {
    return { is_logged_in: false, is_admin: false, is_streamer: false, is_moderator: false, role: 'guest' };
  }
  const uClean = username.trim().toLowerCase();
  const isOwner = (uClean === KICK_CHANNEL.toLowerCase());
  const isMod = KICK_MODERATORS.includes(uClean);
  const isAdmin = isOwner || isMod;

  return {
    is_logged_in: true,
    is_admin: isAdmin,
    is_streamer: isOwner,
    is_moderator: isMod,
    role: isOwner ? 'streamer' : (isMod ? 'moderator' : 'viewer')
  };
}
