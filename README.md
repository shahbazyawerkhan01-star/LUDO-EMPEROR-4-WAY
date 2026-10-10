<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ludo Emperor 4 Way — Multiplayer</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --panel-2: #1f2937;
        --accent: #f59e0b;
        --accent-2: #22c55e;
        --text: #f8fafc;
        --muted: #cbd5e1;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Arial, sans-serif;
        background: radial-gradient(circle at top, #1e293b, var(--bg));
        color: var(--text);
        display: grid;
        place-items: center;
      }
      .shell {
        width: min(900px, calc(100vw - 32px));
        background: rgba(17, 24, 39, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
      }
      h1 { margin-top: 0; }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 16px 0;
      }
      input, button {
        border-radius: 12px;
        border: none;
        padding: 12px 14px;
        font-size: 16px;
      }
      input {
        background: var(--panel-2);
        color: var(--text);
        min-width: 210px;
      }
      button {
        background: var(--accent);
        color: #111827;
        font-weight: 700;
        cursor: pointer;
      }
      button.secondary {
        background: var(--accent-2);
      }
      .badge {
        background: rgba(34, 197, 94, 0.12);
        color: #bfdbfe;
        border: 1px solid rgba(34, 197, 94, 0.25);
        padding: 8px 12px;
        border-radius: 999px;
        display: inline-block;
      }
      .status {
        margin-top: 20px;
        padding: 16px;
        border-radius: 12px;
        background: rgba(148, 163, 184, 0.08);
        color: var(--muted);
      }
      .players {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .player-pill {
        background: rgba(59, 130, 246, 0.14);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #e2e8f0;
        padding: 8px 10px;
        border-radius: 999px;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Ludo Emperor 4 Way</h1>
      <p>Play with friends from anywhere in the world.</p>

      <div class="row">
        <input id="playerName" placeholder="Your name" value="Player" />
        <button id="createRoom">Create room</button>
      </div>

      <div class="row">
        <input id="roomCode" placeholder="Room code" maxlength="10" />
        <button class="secondary" id="joinRoom">Join room</button>
      </div>

      <div class="row">
        <span class="badge" id="shareBadge">No room yet</span>
      </div>

      <div class="status" id="status">
        Connect a room, share the code, and invite friends from any country.
      </div>

      <div class="players" id="players"></div>
    </div>

    <script type="module">
      const statusEl = document.getElementById('status');
      const playersEl = document.getElementById('players');
      const roomCodeEl = document.getElementById('roomCode');
      const shareBadge = document.getElementById('shareBadge');
      const playerNameEl = document.getElementById('playerName');

      const queryParams = new URLSearchParams(window.location.search);
      const roomFromUrl = queryParams.get('room');
      if (roomFromUrl) roomCodeEl.value = roomFromUrl;

      async function createRoom() {
        const playerName = playerNameEl.value.trim() || 'Player';
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName })
        });

        const data = await res.json();
        if (!res.ok) {
          statusEl.textContent = data.message || 'Could not create room';
          return;
        }

        roomCodeEl.value = data.roomCode;
        shareBadge.textContent = `Room: ${data.roomCode}`;
        statusEl.textContent = `Room created. Share this code: ${data.roomCode}`;
        window.history.replaceState({}, '', `/?room=${data.roomCode}`);
      }

      async function joinRoom() {
        const playerName = playerNameEl.value.trim() || 'Player';
        const roomCode = roomCodeEl.value.trim().toUpperCase();
        if (!roomCode) {
          statusEl.textContent = 'Enter a room code first.';
          return;
        }

        const res = await fetch('/api/rooms/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerName })
        });

        const data = await res.json();
        if (!res.ok) {
          statusEl.textContent = data.message || 'Could not join room';
          return;
        }

        shareBadge.textContent = `Room: ${data.roomCode}`;
        statusEl.textContent = `Joined room ${data.roomCode}. Waiting for friends...`;
        renderPlayers(data.players || []);
        window.history.replaceState({}, '', `/?room=${data.roomCode}`);
      }

      function renderPlayers(players) {
        playersEl.innerHTML = '';
        players.forEach((player) => {
          const pill = document.createElement('span');
          pill.className = 'player-pill';
          pill.textContent = player.name;
          playersEl.appendChild(pill);
        });
      }

      document.getElementById('createRoom').addEventListener('click', createRoom);
      document.getElementById('joinRoom').addEventListener('click', joinRoom);

      if (roomFromUrl) {
        statusEl.textContent = `Room found: ${roomFromUrl}. Join now.`;
      }
    </script>
  </body>
</html>
