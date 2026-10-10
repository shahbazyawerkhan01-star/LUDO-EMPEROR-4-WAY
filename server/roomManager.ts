import {
    IN_BASE, LAST_TRACK, PATH_START, HOME, SAFE, START_IDX,
    hasWon, isLuckySum, legalMoves, luckySevenAllowed, percent, pickMove, randDie,
    type Move, type Tokens
} from '../src/game/rules';

export interface RoomPlayer {
    id: string; // sessionToken
    socketId: string | null;
    name: string;
    avatar: string;
    colorIndex: number; // 0: Red, 1: Green, 2: Yellow, 3: Blue/Cyan
    isHost: boolean;
    isReady: boolean;
    isAI: boolean;
    connected: boolean;
    disconnectTime?: number;
}

export interface ClientRoomState {
    code: string;
    hostId: string;
    players: (RoomPlayer | null)[];
    fillBots: boolean;
    phase: 'lobby' | 'playing' | 'game_over';
    currentTurn: number;
    turnDeadline: number;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    tokens: number[][];
    winner: number | null;
    rankings: { idx: number; name: string; avatar: string; pct: number }[];
    turnDuration: number;
}

export interface InternalRoom {
    code: string;
    hostId: string;
    players: (RoomPlayer | null)[];
    fillBots: boolean;
    phase: 'lobby' | 'playing' | 'game_over';
    currentTurn: number;
    turnDeadline: number;
    turnTimer: NodeJS.Timeout | null;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    sixStreak: number[];
    tokens: number[][];
    winner: number | null;
    rankings: { idx: number; name: string; avatar: string; pct: number }[];
    createdAt: number;
    lastActivity: number;
    rematchVotes: Set<string>;
}

const TURN_DURATION_MS = 30000;
const DISCONNECT_GRACE_MS = 60000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DEFAULT_BOT_NAMES = ['Red Bot', 'Green Bot', 'Yellow Bot', 'Cyan Bot'];
const DEFAULT_BOT_AVATARS = ['🤖', '🍀', '🌟', '👑'];

export class RoomManager {
    private rooms = new Map<string, InternalRoom>();
    private socketToRoom = new Map<string, { code: string; sessionToken: string }>();
    private disconnectTimers = new Map<string, NodeJS.Timeout>();
    private broadcastCallback?: (roomCode: string, event: string, payload: any) => void;

    public setBroadcastCallback(cb: (roomCode: string, event: string, payload: any) => void) {
        this.broadcastCallback = cb;
    }

    private emitToRoom(roomCode: string, event: string, payload: any) {
        if (this.broadcastCallback) {
            this.broadcastCallback(roomCode, event, payload);
        }
    }

    private generateCode(): string {
        for (let attempt = 0; attempt < 100; attempt++) {
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
            }
            if (!this.rooms.has(code)) return code;
        }
        return `LU${Math.floor(1000 + Math.random() * 9000)}`;
    }

    public getRoom(code: string): InternalRoom | undefined {
        return this.rooms.get(code.toUpperCase().trim());
    }

    public getClientRoomState(room: InternalRoom): ClientRoomState {
        return {
            code: room.code,
            hostId: room.hostId,
            players: room.players.map((p) => (p ? { ...p, socketId: null } : null)),
            fillBots: room.fillBots,
            phase: room.phase,
            currentTurn: room.currentTurn,
            turnDeadline: room.turnDeadline,
            dice: room.dice,
            diceUsed: room.diceUsed,
            tokens: room.tokens,
            winner: room.winner,
            rankings: room.rankings,
            turnDuration: TURN_DURATION_MS / 1000,
        };
    }

    public createRoom(sessionToken: string, name: string, avatar: string, socketId: string): { ok: boolean; roomCode?: string; error?: string } {
        const code = this.generateCode();
        const hostPlayer: RoomPlayer = {
            id: sessionToken,
            socketId,
            name: name.trim().slice(0, 16) || 'Host',
            avatar: avatar || '🤴',
            colorIndex: 0,
            isHost: true,
            isReady: true,
            isAI: false,
            connected: true,
        };

        const room: InternalRoom = {
            code,
            hostId: sessionToken,
            players: [hostPlayer, null, null, null],
            fillBots: true,
            phase: 'lobby',
            currentTurn: 0,
            turnDeadline: 0,
            turnTimer: null,
            dice: null,
            diceUsed: [true, true],
            sixStreak: [0, 0, 0, 0],
            tokens: [
                [-1, -1, -1, -1],
                [-1, -1, -1, -1],
                [-1, -1, -1, -1],
                [-1, -1, -1, -1],
            ],
            winner: null,
            rankings: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
            rematchVotes: new Set(),
        };

        this.rooms.set(code, room);
        this.socketToRoom.set(socketId, { code, sessionToken });
        return { ok: true, roomCode: code };
    }

    public joinRoom(roomCode: string, sessionToken: string, name: string, avatar: string, socketId: string): { ok: boolean; playerIndex?: number; error?: string } {
        const cleanCode = roomCode.toUpperCase().trim();
        const room = this.rooms.get(cleanCode);
        if (!room) {
            return { ok: false, error: 'Room does not exist' };
        }

        // Check if player is reconnecting with same session token
        const existingIdx = room.players.findIndex((p) => p && p.id === sessionToken);
        if (existingIdx !== -1) {
            const player = room.players[existingIdx]!;
            player.socketId = socketId;
            player.connected = true;
            delete player.disconnectTime;

            // Clear disconnect timer if active
            const timerKey = `${cleanCode}:${sessionToken}`;
            const timer = this.disconnectTimers.get(timerKey);
            if (timer) {
                clearTimeout(timer);
                this.disconnectTimers.delete(timerKey);
            }

            this.socketToRoom.set(socketId, { code: cleanCode, sessionToken });
            this.emitToRoom(cleanCode, 'room_updated', this.getClientRoomState(room));
            return { ok: true, playerIndex: existingIdx };
        }

        if (room.phase !== 'lobby') {
            return { ok: false, error: 'Match is already in progress' };
        }

        const openIndex = room.players.findIndex((p) => p === null);
        if (openIndex === -1) {
            return { ok: false, error: 'Room is full (max 4 players)' };
        }

        const newPlayer: RoomPlayer = {
            id: sessionToken,
            socketId,
            name: name.trim().slice(0, 16) || `Player ${openIndex + 1}`,
            avatar: avatar || ['🔥', '🍀', '🌟', '👑'][openIndex],
            colorIndex: openIndex,
            isHost: false,
            isReady: false,
            isAI: false,
            connected: true,
        };

        room.players[openIndex] = newPlayer;
        room.lastActivity = Date.now();
        this.socketToRoom.set(socketId, { code: cleanCode, sessionToken });

        this.emitToRoom(cleanCode, 'room_updated', this.getClientRoomState(room));
        return { ok: true, playerIndex: openIndex };
    }

    public toggleReady(roomCode: string, sessionToken: string): boolean {
        const room = this.getRoom(roomCode);
        if (!room || room.phase !== 'lobby') return false;

        const player = room.players.find((p) => p && p.id === sessionToken);
        if (!player || player.isHost) return false;

        player.isReady = !player.isReady;
        room.lastActivity = Date.now();
        this.emitToRoom(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public toggleFillBots(roomCode: string, sessionToken: string, fillBots: boolean): boolean {
        const room = this.getRoom(roomCode);
        if (!room || room.phase !== 'lobby' || room.hostId !== sessionToken) return false;

        room.fillBots = fillBots;
        room.lastActivity = Date.now();
        this.emitToRoom(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public startGame(roomCode: string, sessionToken: string): { ok: boolean; error?: string } {
        const room = this.getRoom(roomCode);
        if (!room) return { ok: false, error: 'Room not found' };
        if (room.phase !== 'lobby') return { ok: false, error: 'Game already started' };
        if (room.hostId !== sessionToken) return { ok: false, error: 'Only the host can start the game' };

        // Verify guests are ready
        const joinedGuests = room.players.filter((p) => p !== null && !p.isHost && !p.isAI) as RoomPlayer[];
        const unreadyGuest = joinedGuests.find((g) => !g.isReady);
        if (unreadyGuest) {
            return { ok: false, error: `Waiting for ${unreadyGuest.name} to get ready` };
        }

        // Fill vacant slots if fillBots is enabled
        for (let i = 0; i < 4; i++) {
            if (!room.players[i] && room.fillBots) {
                room.players[i] = {
                    id: `bot_${i}_${Date.now()}`,
                    socketId: null,
                    name: DEFAULT_BOT_NAMES[i],
                    avatar: DEFAULT_BOT_AVATARS[i],
                    colorIndex: i,
                    isHost: false,
                    isReady: true,
                    isAI: true,
                    connected: true,
                };
            }
        }

        const activeCount = room.players.filter((p) => p !== null).length;
        if (activeCount < 2) {
            return { ok: false, error: 'Need at least 2 players or bots to start' };
        }

        // Initialize game board
        room.phase = 'playing';
        room.tokens = [
            [-1, -1, -1, -1],
            [-1, -1, -1, -1],
            [-1, -1, -1, -1],
            [-1, -1, -1, -1],
        ];
        room.dice = null;
        room.diceUsed = [true, true];
        room.sixStreak = [0, 0, 0, 0];
        room.winner = null;
        room.rankings = [];
        room.lastActivity = Date.now();

        // First active player
        let startTurn = 0;
        while (!room.players[startTurn]) {
            startTurn = (startTurn + 1) % 4;
        }
        room.currentTurn = startTurn;
        room.turnDeadline = Date.now() + TURN_DURATION_MS;

        this.emitToRoom(room.code, 'game_started', this.getClientRoomState(room));
        this.armTurnTimer(room);

        // If first player is an AI, trigger AI turn
        if (room.players[startTurn]?.isAI) {
            this.scheduleAITurn(room);
        }

        return { ok: true };
    }

    private armTurnTimer(room: InternalRoom) {
        if (room.turnTimer) clearTimeout(room.turnTimer);
        room.turnDeadline = Date.now() + TURN_DURATION_MS;

        room.turnTimer = setTimeout(() => {
            this.handleTurnTimeout(room.code);
        }, TURN_DURATION_MS);
    }

    private clearTurnTimer(room: InternalRoom) {
        if (room.turnTimer) {
            clearTimeout(room.turnTimer);
            room.turnTimer = null;
        }
    }

    private handleTurnTimeout(roomCode: string) {
        const room = this.getRoom(roomCode);
        if (!room || room.phase !== 'playing') return;

        const currentP = room.currentTurn;
        const player = room.players[currentP];
        if (!player) return;

        // If player has not rolled dice yet, auto-roll
        if (room.diceUsed[0] && room.diceUsed[1] && room.dice === null) {
            this.executeRoll(room, currentP, true);
            return;
        }

        // If player rolled but has unused dice, pick an AI move or pass
        if (!room.diceUsed[0] || !room.diceUsed[1]) {
            const activeSlots = room.players.map((p) => !!p);
            const legal = this.getLegalMoves(room, currentP, activeSlots);
            if (legal.length > 0) {
                const chosen = pickMove(room.tokens as Tokens, currentP, legal, activeSlots);
                this.executeMove(room, currentP, chosen.die, chosen.tok, true);
            } else {
                this.advanceTurn(room, false);
            }
        }
    }

    public rollDice(roomCode: string, sessionToken: string): { ok: boolean; error?: string } {
        const room = this.getRoom(roomCode);
        if (!room || room.phase !== 'playing') return { ok: false, error: 'Game is not playing' };

        const currentP = room.currentTurn;
        const player = room.players[currentP];
        if (!player || player.id !== sessionToken) {
            return { ok: false, error: 'Not your turn to roll' };
        }

        if (room.dice !== null && (!room.diceUsed[0] || !room.diceUsed[1])) {
            return { ok: false, error: 'Dice already rolled for this turn' };
        }

        this.executeRoll(room, currentP, false);
        return { ok: true };
    }

    private executeRoll(room: InternalRoom, p: number, isTimeout: boolean) {
        let a = randDie();
        let b = randDie();
        const lucky = luckySevenAllowed(room.tokens as Tokens, p) && isLuckySum(a, b) && !(a === 6 && b === 6);
        if (lucky) {
            a = 6;
            b = 6;
        }

        room.dice = [a, b];
        room.diceUsed = [false, false];

        const double6 = a === 6 && b === 6;
        if (double6) {
            room.sixStreak[p]++;
        } else {
            room.sixStreak[p] = 0;
        }

        // 3 double 6s loses the turn
        if (room.sixStreak[p] >= 3) {
            room.sixStreak[p] = 0;
            room.diceUsed = [true, true];
            this.emitToRoom(room.code, 'dice_rolled', {
                p,
                dice: [a, b],
                lucky,
                streakForfeited: true,
                movableTokens: [],
            });
            setTimeout(() => {
                this.advanceTurn(room, false);
            }, 1800);
            return;
        }

        const activeSlots = room.players.map((pl) => !!pl);
        const legal = this.getLegalMoves(room, p, activeSlots);

        this.emitToRoom(room.code, 'dice_rolled', {
            p,
            dice: [a, b],
            lucky,
            streakForfeited: false,
            movableTokens: legal.map((m) => ({ tok: m.tok, die: m.die })),
        });

        if (legal.length === 0) {
            // No moves available, advance turn after short delay
            setTimeout(() => {
                this.advanceTurn(room, false);
            }, 1800);
        } else {
            // Re-arm timer for move selection
            this.armTurnTimer(room);

            // If player is an AI, schedule automated move
            if (room.players[p]?.isAI) {
                setTimeout(() => {
                    if (room.phase === 'playing' && room.currentTurn === p) {
                        const movesNow = this.getLegalMoves(room, p, activeSlots);
                        if (movesNow.length > 0) {
                            const chosen = pickMove(room.tokens as Tokens, p, movesNow, activeSlots);
                            this.executeMove(room, p, chosen.die, chosen.tok, false);
                        } else {
                            this.advanceTurn(room, false);
                        }
                    }
                }, 1200);
            }
        }
    }

    private getLegalMoves(room: InternalRoom, p: number, activeSlots: boolean[]): Move[] {
        if (!room.dice) return [];
        const out: Move[] = [];
        for (let i = 0; i < 2; i++) {
            if (!room.diceUsed[i]) {
                out.push(...legalMoves(room.tokens as Tokens, p, room.dice[i], i, activeSlots));
            }
        }
        return out;
    }

    public movePawn(roomCode: string, sessionToken: string, dieIndex: number, tokenIndex: number): { ok: boolean; error?: string } {
        const room = this.getRoom(roomCode);
        if (!room || room.phase !== 'playing') return { ok: false, error: 'Game is not playing' };

        const currentP = room.currentTurn;
        const player = room.players[currentP];
        if (!player || player.id !== sessionToken) {
            return { ok: false, error: 'Not your turn to move' };
        }

        if (room.diceUsed[dieIndex] || !room.dice) {
            return { ok: false, error: 'Selected die is already used or not rolled' };
        }

        const activeSlots = room.players.map((pl) => !!pl);
        const legal = legalMoves(room.tokens as Tokens, currentP, room.dice[dieIndex], dieIndex, activeSlots);
        const chosen = legal.find((m) => m.tok === tokenIndex && m.die === dieIndex);

        if (!chosen) {
            return { ok: false, error: 'Illegal pawn move for selected die' };
        }

        this.executeMove(room, currentP, dieIndex, tokenIndex, false);
        return { ok: true };
    }

    private executeMove(room: InternalRoom, p: number, dieIndex: number, tokenIndex: number, isAuto: boolean) {
        if (!room.dice || room.diceUsed[dieIndex]) return;

        const activeSlots = room.players.map((pl) => !!pl);
        const legal = legalMoves(room.tokens as Tokens, p, room.dice[dieIndex], dieIndex, activeSlots);
        const chosen = legal.find((m) => m.tok === tokenIndex && m.die === dieIndex);
        if (!chosen) return;

        // Apply pawn update
        room.diceUsed[dieIndex] = true;
        room.tokens[p][tokenIndex] = chosen.to;

        // Apply captures
        const captures: { p: number; t: number }[] = [];
        for (const c of chosen.captures) {
            room.tokens[c.p][c.t] = IN_BASE;
            captures.push({ p: c.p, t: c.t });
        }

        const reachedHome = chosen.reachesHome;
        const double6 = room.dice[0] === 6 && room.dice[1] === 6;
        let extraTurn = double6 || captures.length > 0 || reachedHome;

        this.emitToRoom(room.code, 'pawn_moved', {
            p,
            dieIndex,
            tokenIndex,
            to: chosen.to,
            captures,
            reachedHome,
            diceUsed: room.diceUsed,
            isAuto,
        });

        // Check if player won
        if (hasWon(room.tokens as Tokens, p)) {
            this.handlePlayerWin(room, p);
            return;
        }

        // Check if second die is still usable
        const unusedDie = [0, 1].find((i) => !room.diceUsed[i]);
        if (unusedDie !== undefined) {
            const nextMoves = this.getLegalMoves(room, p, activeSlots);
            if (nextMoves.length > 0) {
                this.armTurnTimer(room);
                if (room.players[p]?.isAI) {
                    setTimeout(() => {
                        if (room.phase === 'playing' && room.currentTurn === p) {
                            const secondChosen = pickMove(room.tokens as Tokens, p, nextMoves, activeSlots);
                            this.executeMove(room, p, secondChosen.die, secondChosen.tok, false);
                        }
                    }, 1400);
                }
                return;
            }
        }

        // Both dice handled or no further moves, advance turn
        setTimeout(() => {
            this.advanceTurn(room, extraTurn);
        }, 1200);
    }

    private handlePlayerWin(room: InternalRoom, winnerIdx: number) {
        room.winner = winnerIdx;
        room.phase = 'game_over';
        this.clearTurnTimer(room);

        // Build ranking
        const rows = [0, 1, 2, 3]
            .map((p) => {
                const player = room.players[p];
                if (!player) return null;
                return {
                    idx: p,
                    name: player.name,
                    avatar: player.avatar,
                    pct: p === winnerIdx ? 100 : percent(room.tokens as Tokens, p),
                };
            })
            .filter((r): r is { idx: number; name: string; avatar: string; pct: number } => r !== null);

        rows.sort((a, b) => (a.idx === winnerIdx ? -1 : b.idx === winnerIdx ? 1 : b.pct - a.pct));
        room.rankings = rows;

        this.emitToRoom(room.code, 'game_over', {
            winner: winnerIdx,
            rankings: room.rankings,
        });
    }

    private advanceTurn(room: InternalRoom, extraTurn: boolean) {
        if (room.phase !== 'playing') return;

        let nextTurn = room.currentTurn;
        if (!extraTurn) {
            let next = (room.currentTurn + 1) % 4;
            while (!room.players[next]) {
                next = (next + 1) % 4;
            }
            nextTurn = next;
        }

        room.currentTurn = nextTurn;
        room.dice = null;
        room.diceUsed = [true, true];
        room.turnDeadline = Date.now() + TURN_DURATION_MS;

        this.emitToRoom(room.code, 'turn_changed', {
            currentTurn: nextTurn,
            turnDeadline: room.turnDeadline,
            extraTurn,
        });

        this.armTurnTimer(room);

        if (room.players[nextTurn]?.isAI) {
            this.scheduleAITurn(room);
        }
    }

    private scheduleAITurn(room: InternalRoom) {
        setTimeout(() => {
            if (room.phase === 'playing' && room.players[room.currentTurn]?.isAI) {
                this.executeRoll(room, room.currentTurn, false);
            }
        }, 1500);
    }

    public sendChat(roomCode: string, sessionToken: string, text: string, emoji?: string): boolean {
        const room = this.getRoom(roomCode);
        if (!room) return false;

        const player = room.players.find((p) => p && p.id === sessionToken);
        if (!player) return false;

        this.emitToRoom(room.code, 'chat_received', {
            p: player.colorIndex,
            name: player.name,
            avatar: player.avatar,
            text: text.slice(0, 80),
            emoji,
        });
        return true;
    }

    public voteRematch(roomCode: string, sessionToken: string): { ok: boolean } {
        const room = this.getRoom(roomCode);
        if (!room || room.phase !== 'game_over') return { ok: false };

        room.rematchVotes.add(sessionToken);
        const humanCount = room.players.filter((p) => p && !p.isAI).length;

        // If host votes or majority votes, reset to lobby
        if (sessionToken === room.hostId || room.rematchVotes.size >= Math.max(1, Math.ceil(humanCount / 2))) {
            room.phase = 'lobby';
            room.rematchVotes.clear();
            room.winner = null;
            room.rankings = [];
            room.dice = null;
            room.diceUsed = [true, true];
            room.sixStreak = [0, 0, 0, 0];
            room.tokens = [
                [-1, -1, -1, -1],
                [-1, -1, -1, -1],
                [-1, -1, -1, -1],
                [-1, -1, -1, -1],
            ];
            // Clear AI bots so lobby can invite friends again
            for (let i = 0; i < 4; i++) {
                if (room.players[i]?.isAI) {
                    room.players[i] = null;
                }
            }

            this.emitToRoom(room.code, 'rematch_started', this.getClientRoomState(room));
        } else {
            this.emitToRoom(room.code, 'rematch_voted', {
                votes: room.rematchVotes.size,
                needed: humanCount,
            });
        }

        return { ok: true };
    }

    public handleSocketDisconnect(socketId: string) {
        const mapping = this.socketToRoom.get(socketId);
        if (!mapping) return;

        this.socketToRoom.delete(socketId);
        const { code, sessionToken } = mapping;
        const room = this.getRoom(code);
        if (!room) return;

        const playerIdx = room.players.findIndex((p) => p && p.id === sessionToken);
        if (playerIdx === -1) return;

        const player = room.players[playerIdx]!;
        player.connected = false;
        player.disconnectTime = Date.now();

        this.emitToRoom(code, 'player_disconnected', {
            p: playerIdx,
            name: player.name,
            graceSeconds: DISCONNECT_GRACE_MS / 1000,
        });

        // Set 60-second grace timer
        const timerKey = `${code}:${sessionToken}`;
        const timer = setTimeout(() => {
            this.handleDisconnectExpiry(code, sessionToken);
        }, DISCONNECT_GRACE_MS);

        this.disconnectTimers.set(timerKey, timer);
    }

    private handleDisconnectExpiry(roomCode: string, sessionToken: string) {
        const timerKey = `${roomCode}:${sessionToken}`;
        this.disconnectTimers.delete(timerKey);

        const room = this.getRoom(roomCode);
        if (!room) return;

        const playerIdx = room.players.findIndex((p) => p && p.id === sessionToken);
        if (playerIdx === -1) return;

        const player = room.players[playerIdx]!;
        if (player.connected) return; // already reconnected

        if (room.phase === 'lobby') {
            room.players[playerIdx] = null;
            // If host left, assign new host if someone remains
            if (player.isHost) {
                const nextHost = room.players.find((p) => p !== null && !p.isAI);
                if (nextHost) {
                    nextHost.isHost = true;
                    room.hostId = nextHost.id;
                } else {
                    this.rooms.delete(room.code);
                    return;
                }
            }
            this.emitToRoom(roomCode, 'room_updated', this.getClientRoomState(room));
        } else if (room.phase === 'playing') {
            // Convert to AI bot so match does not stall
            player.isAI = true;
            player.name = `${player.name} (Bot)`;
            this.emitToRoom(roomCode, 'player_converted_to_bot', {
                p: playerIdx,
                name: player.name,
            });

            // If it's currently their turn, trigger AI move
            if (room.currentTurn === playerIdx) {
                this.scheduleAITurn(room);
            }
        }
    }
}

export const roomManager = new RoomManager();
