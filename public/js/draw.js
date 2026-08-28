// Controlador de la Ruleta y Animación Cinemática para OBS
let drawState = null;
let isSpinning = false;
let ws = null;

const drawPrizeTitle = document.getElementById('drawPrizeTitle');
const drawSubtitle = document.getElementById('drawSubtitle');

const tumblerBox = document.getElementById('tumblerBox');
const rollingNumberDisplay = document.getElementById('rollingNumberDisplay');
const rollingUserBox = document.getElementById('rollingUserBox');
const rollingAvatar = document.getElementById('rollingAvatar');
const rollingUsername = document.getElementById('rollingUsername');

const winnerCard = document.getElementById('winnerCard');
const winnerAvatar = document.getElementById('winnerAvatar');
const winnerName = document.getElementById('winnerName');
const winnerSeatNum = document.getElementById('winnerSeatNum');
const winnerTotalTickets = document.getElementById('winnerTotalTickets');
const winnerOdds = document.getElementById('winnerOdds');

const startDrawBtn = document.getElementById('startDrawBtn');
const resetDrawViewBtn = document.getElementById('resetDrawViewBtn');

async function loadDrawData() {
  try {
    const res = await fetch('/api/state?username=CaozLive');
    if (!res.ok) throw new Error('Error cargando estado');
    drawState = await res.json();
    
    if (drawState.config) {
      drawPrizeTitle.textContent = `GRAN SORTEO ${drawState.config.prize.toUpperCase()}`;
      drawSubtitle.textContent = `Canal Oficial de Kick: @${drawState.config.channel || 'CaozLive'}`;
    }

    if (drawState.winner && !isSpinning) {
      displayWinnerDirect(drawState.winner);
    }
  } catch (err) {
    console.error('Error in loadDrawData:', err);
  }
}

function displayWinnerDirect(winner) {
  tumblerBox.style.display = 'none';
  winnerCard.style.display = 'block';

  winnerAvatar.src = winner.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${winner.username}`;
  winnerName.textContent = `@${winner.username}`;
  winnerSeatNum.textContent = `#${winner.seat_number}`;
  winnerTotalTickets.textContent = winner.user_total_tickets || 1;
  winnerOdds.textContent = `${winner.win_probability || 0}%`;
}

// -------------------------------------------------------------------
// Animación Cinemática del Sorteo
// -------------------------------------------------------------------
async function startLiveDraw() {
  if (isSpinning) return;

  // Verificar si hay asientos ocupados
  const occupiedKeys = Object.keys(drawState?.seats || {});
  if (occupiedKeys.length === 0) {
    alert('¡No hay ningún asiento ocupado en la sala para sortear! Los espectadores deben elegir sus números primero.');
    return;
  }

  try {
    isSpinning = true;
    startDrawBtn.disabled = true;
    winnerCard.style.display = 'none';
    tumblerBox.style.display = 'block';
    rollingUserBox.style.visibility = 'visible';

    // 1. Obtener ganador desde el backend
    const res = await fetch('/api/giveaway/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'random' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al ejecutar sorteo');

    const winner = data.winner;
    const candidates = Object.values(drawState.seats);

    // 2. Secuencia de Ruleta con Desaceleración Gradual (Easing)
    const totalDuration = 7000; // 7 segundos de emoción en vivo
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / totalDuration);

      // Curva de desaceleración cúbica
      const easeOut = 1 - Math.pow(1 - progress, 3);

      // Elegir un candidato aleatorio durante el giro
      const randomCandidate = candidates[Math.floor(Math.random() * candidates.length)];
      rollingNumberDisplay.textContent = `#${randomCandidate.seat_number}`;
      rollingAvatar.src = randomCandidate.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${randomCandidate.username}`;
      rollingUsername.textContent = `@${randomCandidate.username}`;

      // Efecto de sonido de tick
      window.soundFX.playRouletteTick(1 - easeOut);

      if (progress < 1) {
        // Velocidad variable según el avance
        const delay = 30 + easeOut * 350; // De 30ms (súper rápido) a 380ms (lento y tenso)
        setTimeout(() => requestAnimationFrame(step), delay);
      } else {
        // 3. FRENADO FINAL Y REVELACIÓN DEL GANADOR
        finishDraw(winner);
      }
    }

    requestAnimationFrame(step);

  } catch (err) {
    console.error('Error starting draw:', err);
    alert(err.message);
    isSpinning = false;
    startDrawBtn.disabled = false;
  }
}

function finishDraw(winner) {
  rollingNumberDisplay.textContent = `#${winner.seat_number}`;
  rollingAvatar.src = winner.avatar;
  rollingUsername.textContent = `@${winner.username}`;

  setTimeout(() => {
    tumblerBox.style.display = 'none';
    winnerCard.style.display = 'block';

    winnerAvatar.src = winner.avatar;
    winnerName.textContent = `@${winner.username}`;
    winnerSeatNum.textContent = `#${winner.seat_number}`;
    winnerTotalTickets.textContent = winner.user_total_tickets;
    winnerOdds.textContent = `${winner.win_probability}%`;

    // Efectos de sonido triunfales
    window.soundFX.playWinnerFanfare();

    // Ráfaga masiva de confeti para el directo
    if (typeof confetti === 'function') {
      const count = 200;
      const defaults = { origin: { y: 0.6 } };

      function fire(particleRatio, opts) {
        confetti(Object.assign({}, defaults, opts, {
          particleCount: Math.floor(count * particleRatio)
        }));
      }

      fire(0.25, { spread: 26, startVelocity: 55 });
      fire(0.2, { spread: 60 });
      fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
      fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
      fire(0.1, { spread: 120, startVelocity: 45 });
    }

    isSpinning = false;
    startDrawBtn.disabled = false;
  }, 900);
}

function resetDrawView() {
  tumblerBox.style.display = 'block';
  winnerCard.style.display = 'none';
  rollingNumberDisplay.textContent = '#--';
  rollingUserBox.style.visibility = 'hidden';
}

// WebSocket para disparar sorteo si se hace desde el Admin
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'DRAW_COMPLETED' && !isSpinning) {
        displayWinnerDirect(msg.winner);
      } else if (msg.type === 'GIVEAWAY_RESET') {
        resetDrawView();
      }
      loadDrawData();
    } catch (e) {}
  };
  ws.onclose = () => setTimeout(initWebSocket, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  loadDrawData();
  initWebSocket();

  startDrawBtn.addEventListener('click', startLiveDraw);
  resetDrawViewBtn.addEventListener('click', resetDrawView);
});
