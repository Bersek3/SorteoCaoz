// =====================================================================
// KICK OAUTH 2.0 PKCE CLIENT-SIDE (PARA GITHUB PAGES & SERVERLESS)
// =====================================================================

const KICK_CLIENT_ID = "01M131A735E7F6N7NYX8FYVNWP";
// Clave secreta codificada para peticiones OAuth
const KICK_CLIENT_SECRET = atob("NzZhMWM4YjBjMjIzM2Y2Njg2MjA1MzkwOGRjOGRhNTE4MDNhNzM4MTdiYWE1NDc2NmM1NjBlMzNhMmNmMjhhMQ==");

// Generador de cadenas aleatorias para PKCE
function generateRandomString(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Generador de SHA-256 Code Challenge con Web Crypto API
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Iniciar Flujo Oficial de Kick OAuth 2.0
async function startKickOAuth() {
  try {
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(32);

    // Guardar en sessionStorage para corroborar al volver
    sessionStorage.setItem('kick_code_verifier', codeVerifier);
    sessionStorage.setItem('kick_auth_state', state);

    // Determinar la Redirect URI actual (limpia de parámetros)
    const redirectUri = window.location.origin + window.location.pathname;

    const authUrl = new URL('https://id.kick.com/oauth/authorize');
    authUrl.searchParams.set('client_id', KICK_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'user:read channel:read');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    console.log('[🚀] Redirigiendo a Kick OAuth 2.0:', authUrl.toString());
    window.location.href = authUrl.toString();
  } catch (err) {
    console.error('Error al iniciar Kick OAuth:', err);
    alert('No se pudo conectar con el portal de Kick OAuth.');
  }
}

// Procesar el Callback cuando Kick devuelve al usuario
async function processKickOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const returnedState = urlParams.get('state');
  const error = urlParams.get('error');

  if (error) {
    console.error('Kick OAuth error:', error, urlParams.get('error_description'));
    window.history.replaceState({}, document.title, window.location.pathname);
    return null;
  }

  if (!code) return null;

  const savedVerifier = sessionStorage.getItem('kick_code_verifier');
  const savedState = sessionStorage.getItem('kick_auth_state');

  // Limpiar URL de los parámetros temporales
  window.history.replaceState({}, document.title, window.location.pathname);

  if (!savedVerifier || returnedState !== savedState) {
    console.warn('Verificación de estado PKCE fallida o expirada.');
  }

  const redirectUri = window.location.origin + window.location.pathname;

  try {
    // Intercambiar código por Access Token
    const tokenRes = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: KICK_CLIENT_ID,
        client_secret: KICK_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: savedVerifier || ''
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Error al obtener token de Kick:', tokenData);
      return null;
    }

    const accessToken = tokenData.access_token;

    // Obtener perfil del usuario desde Kick API
    const userRes = await fetch('https://api.kick.com/public/v1/users', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const userData = await userRes.json();
    let kickUser = null;

    if (userData && userData.data && userData.data[0]) {
      kickUser = userData.data[0];
    } else if (userData && userData.username) {
      kickUser = userData;
    }

    if (kickUser && kickUser.username) {
      const username = kickUser.username;
      const avatar = kickUser.profile_picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

      localStorage.setItem('kick_user', username);
      localStorage.setItem('kick_avatar', avatar);

      // Sincronizar usuario autenticado con Supabase
      if (window.supabase) {
        await window.supabase.from('profiles').upsert({
          kick_user_id: String(kickUser.user_id || Math.floor(Math.random() * 1000000)),
          username: username,
          display_name: kickUser.name || username,
          avatar_url: avatar
        }, { onConflict: 'username' });
      }

      return {
        username: username,
        avatar: avatar,
        kick_user_id: kickUser.user_id
      };
    }
  } catch (err) {
    console.error('Error procesando callback de Kick:', err);
  }

  return null;
}
