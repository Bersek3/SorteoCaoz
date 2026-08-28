-- =====================================================================
-- ESQUEMA SUPABASE POSTGRESQL PARA EL SORTEO PS5 KICK
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase
-- =====================================================================

-- 1. Tabla de Perfiles de Usuarios de Kick
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kick_user_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    is_streamer BOOLEAN DEFAULT FALSE,
    own_subs INTEGER DEFAULT 0,
    gifted_subs INTEGER DEFAULT 0,
    bonus_tickets INTEGER DEFAULT 0,
    total_tickets INTEGER GENERATED ALWAYS AS (own_subs + gifted_subs + bonus_tickets) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Configuración del Sorteo
CREATE TABLE IF NOT EXISTS giveaway_config (
    id TEXT PRIMARY KEY DEFAULT 'current',
    title TEXT DEFAULT 'Sorteo Oficial PlayStation 5 🎮',
    prize TEXT DEFAULT 'PlayStation 5 Slim (Edición Disco)',
    channel_slug TEXT DEFAULT 'CaozLive',
    broadcaster_id TEXT,
    total_seats INTEGER DEFAULT 200,
    is_locked BOOLEAN DEFAULT FALSE,
    winner_seat INTEGER,
    winner_username TEXT,
    winner_avatar TEXT,
    winner_odds NUMERIC,
    winner_total_tickets INTEGER,
    drawn_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar configuración inicial por defecto si no existe
INSERT INTO giveaway_config (id, title, prize, channel_slug, total_seats, is_locked)
VALUES ('current', 'Sorteo Oficial PlayStation 5 🎮', 'PlayStation 5 Slim (Edición Disco)', 'CaozLive', 200, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 3. Tabla de Asientos de Cine Reservados (Anti-Colisión con UNIQUE)
CREATE TABLE IF NOT EXISTS seats (
    seat_number INTEGER PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    avatar_url TEXT,
    claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Registro de Eventos y Webhooks de Kick
CREATE TABLE IF NOT EXISTS kick_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,  -- 'subscription.new', 'subscription.gift', etc.
    kick_user_id TEXT,
    username TEXT,
    count INTEGER DEFAULT 1,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Historial de Ganadores de Sorteos
CREATE TABLE IF NOT EXISTS draw_history (
    id BIGSERIAL PRIMARY KEY,
    seat_number INTEGER NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT,
    total_tickets INTEGER,
    win_probability NUMERIC,
    prize TEXT,
    drawn_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para optimizar búsquedas rápidas en tiempo real
CREATE INDEX IF NOT EXISTS idx_profiles_kick_user_id ON profiles(kick_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_seats_username ON seats(username);

-- Habilitar Row Level Security (RLS) pero permitir lectura pública para el sorteo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE kick_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_history ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública
CREATE POLICY "Lectura pública de perfiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Lectura pública de config" ON giveaway_config FOR SELECT USING (true);
CREATE POLICY "Lectura pública de asientos" ON seats FOR SELECT USING (true);
CREATE POLICY "Lectura pública de historial" ON draw_history FOR SELECT USING (true);

-- Políticas de inserción y modificación para el backend (Service Role / Backend API)
CREATE POLICY "Permiso total para backend en profiles" ON profiles FOR ALL USING (true);
CREATE POLICY "Permiso total para backend en giveaway_config" ON giveaway_config FOR ALL USING (true);
CREATE POLICY "Permiso total para backend en seats" ON seats FOR ALL USING (true);
CREATE POLICY "Permiso total para backend en kick_events" ON kick_events FOR ALL USING (true);
CREATE POLICY "Permiso total para backend en draw_history" ON draw_history FOR ALL USING (true);
