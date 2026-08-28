// Lógica de Sorteo en Ruleta 3D para OBS - Modo Supabase Cloud
let occupiedSeats = [];
let isDrawing = false;
let config = null;

// Elementos DOM
const startDrawBtn = document.getElementById('startDrawBtn');
const resetDrawViewBtn = document.getElementById('resetDrawViewBtn');
const slotTrack = document.getElementById('slotTrack');
const winnerCard = document.getElementById('winnerCard');
const winnerAvatar = document.getElementById('winnerAvatar');
const winnerUsername = document.getElementById('winnerUsername');
const winnerSeatNumber = document.getElementById('winnerSeatNumber');
const winnerTickets = document.getElementById('winnerTickets');
const winnerOdds = document.getElementById('winnerOdds');
const totalParticipantsCount = document.getElementById('totalParticipantsCount');
const prizeTitleText = document.getElementById('prizeTitleText');

async function loadDrawData() {
  if (!supabaseClient) return;

  try {
    const [configRes, seatsRes, profilesRes] = await Promise.all([
      supabaseClient.from('giveaway_config').select('*').eq('id', 'current').single(),
      supabaseClient.from('seats').select('*'),
      supabaseClient.from('profiles').select('*')
    ]);

    config = configRes.data || { prize: 'PlayStation 5 Slim' };
    occupiedSeats = seatsRes.data || [];

    prizeTitleText.textContent = config.prize || 'PlayStation 5 Slim';
    totalParticipantsCount.textContent = occupiedSeats.length;

    renderInitialSlots();
  } catch (err) {
    console.error('Error cargando datos para sorteo:', err);
  }
}

function renderInitialSlots() {
  slotTrack.innerHTML = '';
  if (occupiedSeats.length === 0) {
    slotTrack.innerHTML = `
      <div class="slot-item">
        <span class="slot-number">#--</span>
        <span class="slot-user">Sin participantes</span>
      </div>
    `;
    startDrawBtn.disabled = true;
    return;
  }

  startDrawBtn.disabled = false;

  // Llenar vista previa
  for (let i = 0; i < 20; i++) {
    const seat = occupiedSeats[i % occupiedSeats.length];
    const el = document.createElement('div');
    el.className = 'slot-item';
    el.innerHTML = `
      <span class="slot-number">#${seat.seat_number}</span>
      <span class="slot-user">@${seat.username}</span>
    `;
    slotTrack.appendChild(el);
  }
}

async function startDraw() {
  if (isDrawing || occupiedSeats.length === 0) return;

  isDrawing = true;
  startDrawBtn.disabled = true;
  winnerCard.style.display = 'none';

  // Seleccionar ganador al azar
  const winnerIndex = Math.floor(Math.random() * occupiedSeats.length);
  const winningSeat = occupiedSeats[winnerIndex];

  // Construir tira larga de la ruleta (80 elementos)
  slotTrack.innerHTML = '';
  const totalSlots = 80;
  const targetIndex = 65; // El ganador se detendrá aquí

  for (let i = 0; i < totalSlots; i++) {
    const seat = (i === targetIndex) ? winningSeat : occupiedSeats[Math.floor(Math.random() * occupiedSeats.length)];
    const el = document.createElement('div');
    el.className = 'slot-item';
    if (i === targetIndex) el.classList.add('winner-target');
    el.innerHTML = `
      <span class="slot-number">#${seat.seat_number}</span>
      <span class="slot-user">@${seat.username}</span>
    `;
    slotTrack.appendChild(el);
  }

  // Reproducir sonido de ruleta
  window.soundFX.playRouletteTick();
  const itemWidth = 140;
  const containerWidth = document.querySelector('.slot-window').offsetWidth;
  const targetOffset = (targetIndex * itemWidth) - (containerWidth / 2) + (itemWidth / 2);

  // Animación suave con cubic-bezier
  slotTrack.style.transition = 'transform 7s cubic-bezier(0.12, 0.8, 0.15, 1)';
  slotTrack.style.transform = `translateX(-${targetOffset}px)`;

  // Intervalo de sonido 'tick'
  let tickCount = 0;
  const tickInterval = setInterval(() => {
    tickCount++;
    window.soundFX.playRouletteTick();
    if (tickCount > 35) clearInterval(tickInterval);
  }, 180);

  // Al finalizar el giro
  setTimeout(async () => {
    clearInterval(tickInterval);
    isDrawing = false;

    // Calcular estadísticas del ganador
    const userSeatsCount = occupiedSeats.filter((s) => s.username.toLowerCase() === winningSeat.username.toLowerCase()).length;
    const odds = ((userSeatsCount / occupiedSeats.length) * 100).toFixed(2);

    // Guardar ganador en Supabase
    try {
      await supabaseClient.from('giveaway_config').update({
        winner_seat: winningSeat.seat_number,
        winner_username: winningSeat.username,
        winner_avatar: winningSeat.avatar_url,
        winner_total_tickets: userSeatsCount,
        winner_odds: odds,
        is_locked: true,
        updated_at: new Date().toISOString()
      }).eq('id', 'current');

      await supabaseClient.from('draw_history').insert({
        winner_username: winningSeat.username,
        seat_number: winningSeat.seat_number,
        prize: config.prize,
        total_seats: occupiedSeats.length,
        odds: odds,
        drawn_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('Error guardando ganador en Supabase:', e);
    }

    // Mostrar Carta de Ganador
    winnerAvatar.src = winningSeat.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${winningSeat.username}`;
    winnerUsername.textContent = `@${winningSeat.username}`;
    winnerSeatNumber.textContent = `#${winningSeat.seat_number}`;
    winnerTickets.textContent = `${userSeatsCount} Tickets`;
    winnerOdds.textContent = `${odds}%`;

    winnerCard.style.display = 'block';

    // Fanfarria y Confeti
    window.soundFX.playWinnerFanfare();
    if (typeof confetti === 'function') {
      confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
      setTimeout(() => confetti({ particleCount: 150, spread: 120, origin: { y: 0.4 } }), 500);
      setTimeout(() => confetti({ particleCount: 250, spread: 140, origin: { y: 0.5 } }), 1000);
    }

  }, 7200);
}

function resetDraw() {
  slotTrack.style.transition = 'none';
  slotTrack.style.transform = 'translateX(0)';
  winnerCard.style.display = 'none';
  startDrawBtn.disabled = false;
  renderInitialSlots();
}

document.addEventListener('DOMContentLoaded', () => {
  loadDrawData();
  startDrawBtn.addEventListener('click', startDraw);
  resetDrawViewBtn.addEventListener('click', resetDraw);
});
