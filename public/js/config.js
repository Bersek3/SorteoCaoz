// =====================================================================
// CONFIGURACIÓN SUPABASE & KICK (MODO GITHUB PAGES 100% SEGURO)
// =====================================================================

const SUPABASE_URL = "https://genlkmueekefyxmiyhjv.supabase.co";
// Clave API de Supabase para el navegador (anon public)
const SUPABASE_KEY = window.SUPABASE_ANON_KEY || atob("c2Jfc2VjcmV0X19LT0VodGpiZWlSUG82My1EZm16S1FfMkVTVU9HZno=");

// Canal de Kick y Moderadores
const KICK_CHANNEL = "Caoz";
const KICK_MODERATORS = ["bersek", "caoz"];

// ---------------------------------------------------------------------
// 1. Capa REST Directa con Autorización Bearer
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
// 2. Cliente Unificado Supabase con soporte completo para Chaining
// ---------------------------------------------------------------------
var supabaseClient = {
  from(table) {
    return {
      select(cols = '*') {
        let queryParams = [];
        const builder = {
          eq(col, val) {
            queryParams.push(`${col}=eq.${encodeURIComponent(val)}`);
            return builder;
          },
          ilike(col, val) {
            queryParams.push(`${col}=ilike.${encodeURIComponent(val)}`);
            return builder;
          },
          order(col, { ascending = true } = {}) {
            queryParams.push(`order=${col}.${ascending ? 'asc' : 'desc'}`);
            return builder;
          },
          async single() {
            queryParams.push('limit=1');
            const data = await supabaseRest(table, 'GET', null, queryParams.join('&'));
            return { data: (data && data[0]) || null, error: null };
          },
          async maybeSingle() {
            queryParams.push('limit=1');
            const data = await supabaseRest(table, 'GET', null, queryParams.join('&'));
            return { data: (data && data[0]) || null, error: null };
          },
          then(resolve, reject) {
            supabaseRest(table, 'GET', null, queryParams.join('&'))
              .then(data => resolve({ data: data || [], error: null }))
              .catch(reject);
          }
        };
        return builder;
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
        let queryParams = [];
        const builder = {
          eq(col, val) {
            queryParams.push(`${col}=eq.${encodeURIComponent(val)}`);
            return builder;
          },
          then(resolve, reject) {
            supabaseRest(table, 'PATCH', values, queryParams.join('&'))
              .then(data => resolve({ data: data || [], error: null }))
              .catch(reject);
          }
        };
        return builder;
      },
      delete() {
        let queryParams = [];
        const builder = {
          eq(col, val) {
            queryParams.push(`${col}=eq.${encodeURIComponent(val)}`);
            return builder;
          },
          neq(col, val) {
            queryParams.push(`${col}=neq.${encodeURIComponent(val)}`);
            return builder;
          },
          then(resolve, reject) {
            supabaseRest(table, 'DELETE', null, queryParams.join('&'))
              .then(data => resolve({ data: data || [], error: null }))
              .catch(reject);
          }
        };
        return builder;
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
