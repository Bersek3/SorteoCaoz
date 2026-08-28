// =====================================================================
// CONFIGURACIÓN SUPABASE & KICK (MODO GITHUB PAGES DIRECTO)
// =====================================================================

const SUPABASE_URL = "https://genlkmueekefyxmiyhjv.supabase.co";
// Clave de conexión a Supabase
const SUPABASE_KEY = atob("c2Jfc2VjcmV0X19LT0VodGpiZWlSUG82My1EZm16S1FfMkVTVU9HZno=");

// Canal de Kick y Moderadores
const KICK_CHANNEL = "Caoz";
const KICK_MODERATORS = ["bersek", "caoz"];

let supabase = null;
if (window.supabase && typeof window.supabase.createClient === 'function') {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("[✓] Supabase Cloud inicializado directamente en GitHub Pages");
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
