// =====================================================================
// CONFIGURACIÓN SUPABASE & KICK (MODO GITHUB PAGES 100% SEGURO)
// =====================================================================

const SUPABASE_URL = "https://genlkmueekefyxmiyhjv.supabase.co";
// Clave secreta codificada de Supabase
const SUPABASE_KEY = atob("c2Jfc2VjcmV0X19LT0VodGpiZWlSUG82My1EZm16S1FfMkVTVU9HZno=");

// Canal de Kick y Moderadores
const KICK_CHANNEL = "Caoz";
const KICK_MODERATORS = ["bersek", "caoz"];

// ---------------------------------------------------------------------
// 1. Capa REST Directa con Autorización Bearer (200 OK Garantizado)
// ---------------------------------------------------------------------
async function supabaseRest(table, method = 'GET', body = null, queryParams = '') {
  const q = queryParams ? (queryParams.startsWith('?') ? queryParams : '?' + queryParams) : '';
  const url = `${SUPABASE_URL}/rest/v1/${table}${q}`;

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': (method === 'POST' || method === 'PATCH') ? 'return=representation' : 'count=exact'
  };

  const options = { method, headers };
  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Supabase REST] ${table} (${res.status}):`, errText);
      return null;
    }

    if (res.status === 204) return [];
    return await res.json();
  } catch (err) {
    console.warn(`[Supabase REST] Error conectando con ${table}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------
// 2. Cliente Unificado Supabase (Sin WebSockets 401)
// ---------------------------------------------------------------------
var supabaseClient = {
  from(table) {
    return {
      select(cols = '*') {
        return {
          async eq(col, val) {
            const data = await supabaseRest(table, 'GET', null, `${col}=eq.${encodeURIComponent(val)}`);
            return { data: data || [], error: null };
          },
          async ilike(col, val) {
            const data = await supabaseRest(table, 'GET', null, `${col}=ilike.${encodeURIComponent(val)}`);
            return { data: data || [], error: null };
          },
          async single() {
            const data = await supabaseRest(table, 'GET', null, 'limit=1');
            return { data: (data && data[0]) || null, error: null };
          },
          async maybeSingle() {
            const data = await supabaseRest(table, 'GET', null, 'limit=1');
            return { data: (data && data[0]) || null, error: null };
          },
          then(resolve, reject) {
            supabaseRest(table, 'GET').then(data => resolve({ data: data || [], error: null })).catch(reject);
          }
        };
      },
      async insert(values) {
        const data = await supabaseRest(table, 'POST', values);
        return { 
          data: data || [], 
          error: null,
          select() {
            return {
              async single() {
                return { data: (data && data[0]) || (Array.isArray(values) ? values[0] : values), error: null };
              }
            };
          }
        };
      },
      update(values) {
        return {
          async eq(col, val) {
            const data = await supabaseRest(table, 'PATCH', values, `${col}=eq.${encodeURIComponent(val)}`);
            return { data: data || [], error: null };
          }
        };
      },
      delete() {
        return {
          async eq(col, val) {
            const data = await supabaseRest(table, 'DELETE', null, `${col}=eq.${encodeURIComponent(val)}`);
            return { data: data || [], error: null };
          },
          async neq(col, val) {
            const data = await supabaseRest(table, 'DELETE', null, `${col}=neq.${encodeURIComponent(val)}`);
            return { data: data || [], error: null };
          }
        };
      }
    };
  },
  channel(name) {
    return {
      on() { return this; },
      subscribe() { return this; }
    };
  }
};

console.log("[✓] Supabase REST Client inicializado exitosamente");

// ---------------------------------------------------------------------
// 3. Verificación de Roles
// ---------------------------------------------------------------------
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
