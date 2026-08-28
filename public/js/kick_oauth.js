// Kick OAuth 2.0 PKCE - Flujo Oficial Serverless para GitHub Pages
const KICK_CLIENT_ID = '01JNG06A26N20B30XEF8S9431X';
const KICK_CLIENT_SECRET = ''; // No requerido con PKCE

// Generar par de claves PKCE en el navegador con Web Crypto API
async function generatePKCE() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const codeVerifier = Array.from(array, dec => dec.toString(16).padStart(2, '0')).join('');

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await window.crypto.subtle.digest('SHA-256', data);

  const base64Digest = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { codeVerifier, codeChallenge: base64Digest };
}

// Iniciar sesión con Kick OAuth 2.0 oficial
async function startKickOAuth() {
  try {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    let redirectUri = window.location.origin + window.location.pathname;
    if (redirectUri.endsWith('/index.html')) {
      redirectUri = redirectUri.replace('/index.html', '/');
    }
    if (!redirectUri.endsWith('/') && !redirectUri.includes('.html')) {
      redirectUri += '/';
    }

    // Guardar en sessionStorage para corroborar al volver
    sessionStorage.setItem('kick_code_verifier', codeVerifier);
    sessionStorage.setItem('kick_auth_state', state);
    sessionStorage.setItem('kick_redirect_uri', redirectUri);

    const authUrl = new URL('https://id.kick.com/oauth/authorize');
    authUrl.searchParams.set('client_id', KICK_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'user:read channel:read channel:subscriptions:read events:subscribe');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    console.log('[🚀] Redirigiendo a Kick OAuth 2.0:', authUrl.toString());
    window.location.href = authUrl.toString();
  } catch (err) {
    console.error('Error al iniciar Kick OAuth:', err);
    alert('Error al conectar con Kick OAuth. Ver consola.');
  }
}

// Procesar el Callback cuando Kick devuelve al usuario
async function processKickOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');

  if (!code) return null;

  console.log('[Kick OAuth] Código de autorización recibido:', code);

  const savedVerifier = sessionStorage.getItem('kick_code_verifier');
  const savedRedirectUri = sessionStorage.getItem('kick_redirect_uri') || (window.location.origin + window.location.pathname);

  // Limpiar URL de los parámetros temporales
  window.history.replaceState({}, document.title, window.location.pathname);

  try {
    // 1. Intercambiar código por Access Token
    console.log('[Kick OAuth] Intercambiando código por token con redirect_uri:', savedRedirectUri);
    const tokenRes = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: KICK_CLIENT_ID,
        client_secret: KICK_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: savedRedirectUri,
        code_verifier: savedVerifier || ''
      })
    });

    const tokenData = await tokenRes.json();
    console.log('[Kick OAuth] Respuesta del Token:', tokenRes.status, tokenData);

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('No se pudo obtener el token de acceso de Kick:', tokenData);
      return null;
    }

    const accessToken = tokenData.access_token;
    sessionStorage.setItem('kick_access_token', accessToken);

    // 2. Obtener perfil del usuario desde Kick API
    console.log('[Kick OAuth] Solicitando perfil a https://api.kick.com/public/v1/users');
    const userRes = await fetch('https://api.kick.com/public/v1/users', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const userData = await userRes.json();
    console.log('[Kick OAuth] Respuesta de perfil de usuario:', userData);

    let kickUser = null;
    if (userData && userData.data && userData.data[0]) {
      kickUser = userData.data[0];
    } else if (userData && userData.username) {
      kickUser = userData;
    }

    if (kickUser && (kickUser.username || kickUser.name)) {
      const username = kickUser.username || kickUser.name;
      const avatar = kickUser.profile_picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

      localStorage.setItem('kick_user', username);
      localStorage.setItem('kick_avatar', avatar);

      // 3. Sincronizar usuario autenticado con Supabase (vía REST Helper seguro)
      try {
        if (typeof supabaseRest === 'function') {
          const isOwner = username.toLowerCase() === 'caoz';
          const existing = await supabaseRest('profiles', 'GET', null, `username=ilike.${encodeURIComponent(username)}`);

          if (!existing || existing.length === 0) {
            await supabaseRest('profiles', 'POST', {
              kick_user_id: String(kickUser.user_id || Math.floor(Math.random() * 1000000)),
              username: username,
              display_name: kickUser.name || username,
              avatar_url: avatar,
              is_streamer: isOwner,
              own_subs: 0,
              gifted_subs: 0,
              bonus_tickets: 0
            });
          }
        }
      } catch (dbErr) {
        console.warn('Advertencia al guardar perfil en Supabase:', dbErr);
      }

      return {
        username: username,
        avatar: avatar,
        kick_user_id: kickUser.user_id
      };
    }
  } catch (err) {
    console.error('Excepción al procesar callback de Kick OAuth:', err);
  }

  return null;
}

// -------------------------------------------------------------------
// Comprobación Automática en Vivo de Follow con la API de Kick
// -------------------------------------------------------------------
window.checkKickFollowLive = async function(username) {
  if (!username) return false;
  if (username.toLowerCase() === 'caoz') return true;

  const token = sessionStorage.getItem('kick_access_token');

  try {
    // 1. Intento con Token OAuth oficial a la API de Kick
    if (token) {
      const authRes = await fetch('https://api.kick.com/public/v1/channels/caoz', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }).catch(() => null);

      if (authRes && authRes.ok) {
        const data = await authRes.json();
        if (data && (data.is_following === true || data.following === true)) {
          localStorage.setItem('kick_following_caoz_' + username.toLowerCase(), 'true');
          return true;
        }
      }
    }

    // 2. Consulta a API pública de Kick sobre el canal de Caoz
    const publicRes = await fetch(`https://kick.com/api/v1/channels/caoz`, {
      headers: { 'Accept': 'application/json' }
    }).catch(() => null);

    if (publicRes && publicRes.ok) {
      const channelData = await publicRes.json();
      if (channelData && channelData.user && channelData.user.username.toLowerCase() === username.toLowerCase()) {
        localStorage.setItem('kick_following_caoz_' + username.toLowerCase(), 'true');
        return true;
      }
    }
  } catch (err) {
    console.warn('[Kick Follow API] Error consultando API de Kick:', err);
  }

  // 3. Fallback en tiempo real
  const savedFollow = localStorage.getItem('kick_following_caoz_' + username.toLowerCase());
  return savedFollow === 'true';
};
