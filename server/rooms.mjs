# Ludo Emperor 4 Way Multiplayer

This project is the global multiplayer starter for Ludo Emperor 4 Way.

It includes:
- room creation and join flow
- WebSocket-based live sync
- Supabase-ready persistence layer
- a browser lobby where players can create/join a room from anywhere in the world

## Stack
- Node.js + Express
- WebSocket server
- Supabase for storing room metadata (optional but recommended for production)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the env template:

```bash
cp .env.example .env
```

3. Fill in your Supabase values:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

If you do not want to use Supabase yet, the app still runs in local room mode, but database-backed persistence will be disabled.

4. Start the server:

```bash
npm run dev
```

Then open `http://localhost:8080` in your browser.

## Production deployment

This is designed to run on a public server so your friends can join from anywhere.

Recommended hosting:
- Render
- Railway
- Fly.io
- Vercel + separate backend

## Supabase setup

Create a table called `rooms` with these columns:

```sql
create table public.rooms (
  code text primary key,
  players jsonb default '[]'::jsonb,
  state jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Then enable Row Level Security if needed and set your anon key in `.env`.

## Notes

This repo is intentionally structured as a multiplayer-ready foundation. You can plug your actual Ludo board game logic into the same room sync model.

The real-time room flow is:
- Create room
- Share room code
- Friends join room
- Game state is broadcast to everyone in the room

That is the foundation needed for worldwide friend multiplayer.
