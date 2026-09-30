const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');
const { verifyFirebaseToken } = require('./verifyFirebaseToken');

function generateShortId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory game state store
const games = {};

// Running count of entries in `games`, maintained alongside create/delete so
// the capacity check below is O(1) instead of Object.keys(games).length,
// which would allocate a fresh array of up to MAX_ACTIVE_GAMES keys on every
// single POST /api/games call just to read its .length.
let activeGameCount = 0;

// Win patterns are static — hoisted out of the makeMove handler so we don't
// re-allocate this array (and its 8 sub-arrays) on every single move of
// every game.
const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

// Clean up games that haven't been touched in a while (e.g., 1 hour)
const GAME_TIMEOUT = 60 * 60 * 1000;

// Hard cap on concurrent in-memory games. Without this, POST /api/games is
// unauthenticated and unrate-limited — a scripted client (or a proxy that
// masks distinct source IPs, making per-IP limiting unreliable here) could
// call it in a tight loop and grow `games` without bound until the process
// runs out of memory. The 1-hour idle cleanup doesn't help against a live
// flood. This bound is independent of client IP/proxy topology.
const MAX_ACTIVE_GAMES = 5000;

// Per-IP cap, on top of the global one above. The global cap stops the
// process from being OOM-killed; on its own it doesn't stop a single caller
// from claiming most of the 5000 slots and locking everyone else out with a
// 503. This limits how much of that pool any one source address can hold at
// once. Behind a reverse proxy that doesn't forward the real client IP,
// req.ip collapses to the proxy's address and this degrades to a shared
// bucket for all proxied clients — still strictly better than no per-source
// limit, and orthogonal to the global cap either way.
const GAMES_PER_IP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_GAMES_PER_IP_PER_WINDOW = 100;
const gameCreationsByIp = new Map(); // ip -> { count, windowStart }

function isIpRateLimited(ip) {
    const now = Date.now();
    const entry = gameCreationsByIp.get(ip);
    if (!entry || now - entry.windowStart > GAMES_PER_IP_WINDOW_MS) {
        gameCreationsByIp.set(ip, { count: 1, windowStart: now });
        return false;
    }
    entry.count++;
    return entry.count > MAX_GAMES_PER_IP_PER_WINDOW;
}

function createGame() {
    const gameId = generateShortId();
    const starter = Math.random() < 0.5 ? 'X' : 'O';
    games[gameId] = {
        board: Array(9).fill(null),
        players: { X: null, O: null },
        names: { X: null, O: null },
        uids: { X: null, O: null },
        scores: { X: 0, O: 0 },
        turn: starter,
        starter: starter,
        winner: null,
        lastActivity: Date.now()
    };
    activeGameCount++;
    return gameId;
}

// REST endpoint to create a new game
app.post('/api/games', (req, res) => {
    if (activeGameCount >= MAX_ACTIVE_GAMES) {
        res.status(503).json({ error: 'Server is at capacity, please try again shortly.' });
        return;
    }
    if (isIpRateLimited(req.ip)) {
        res.status(429).json({ error: 'Too many games created from this address, please slow down.' });
        return;
    }
    const gameId = createGame();
    res.json({ gameId });
});

// Leaderboard for this game (nickname-based).
app.get('/api/leaderboard', async (req, res) => {
    const rows = await db.getLeaderboard(20);
    res.json({ game: db.GAME, players: rows });
});

// Merge a previously-played anonymous nickname's stats into the signed-in
// account making this request. Rate-limited implicitly by requiring a fresh
// verified ID token per call (an attacker can't cheaply mint those).
app.post('/api/claim', async (req, res) => {
    const decoded = await verifyFirebaseToken(req.body && req.body.idToken);
    if (!decoded) return res.status(401).json({ error: 'sign in required' });
    const nickname = db.cleanName(req.body && req.body.nickname);
    if (!nickname) return res.status(400).json({ error: 'nickname required' });
    const result = await db.claimNickname(nickname, decoded.uid, decoded.name);
    res.status(result.ok ? 200 : 409).json(result);
});

app.get('/solo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'solo.html'));
});

app.get('/:id', (req, res, next) => {
    // Only match 6-character short IDs to avoid conflicting with other static assets
    if (req.params.id.length === 6) {
        res.sendFile(path.join(__dirname, 'public', 'game.html'));
    } else {
        next();
    }
});

io.on('connection', (socket) => {
    let currentGameId = null;
    let currentSymbol = null;

    socket.on('joinGame', async (payload) => {
        // Backward compatible: payload may be a plain gameId string or { gameId, name, idToken }.
        const gameId = typeof payload === 'string' ? payload : (payload && payload.gameId);
        const name = db.cleanName(payload && payload.name);
        const idToken = payload && payload.idToken;
        const game = games[gameId];
        if (!game) {
            socket.emit('error', 'Game not found or has expired.');
            return;
        }

        currentGameId = gameId;
        game.lastActivity = Date.now();
        socket.join(gameId);

        if (!game.players.X) {
            game.players.X = socket.id;
            currentSymbol = 'X';
        } else if (!game.players.O && game.players.X !== socket.id) {
            game.players.O = socket.id;
            currentSymbol = 'O';
        } else if (game.players.X === socket.id) {
            currentSymbol = 'X';
        } else if (game.players.O === socket.id) {
            currentSymbol = 'O';
        } else {
            currentSymbol = 'Spectator';
        }

        if (name && currentSymbol !== 'Spectator') {
            game.names[currentSymbol] = name;
        }
        if (idToken && currentSymbol !== 'Spectator') {
            // Verified asynchronously — the join itself already happened
            // above so a slow/failed verification never blocks or breaks
            // joining, it just means this round won't be linked to an account.
            const decoded = await verifyFirebaseToken(idToken);
            if (decoded) game.uids[currentSymbol] = decoded.uid;
        }

        socket.emit('joined', { symbol: currentSymbol, game });
        io.to(gameId).emit('gameState', game);
    });

    socket.on('makeMove', (index) => {
        if (!currentGameId || !currentSymbol || currentSymbol === 'Spectator') return;
        const game = games[currentGameId];
        if (!game || game.winner || game.board[index] !== null) return;
        if (game.turn !== currentSymbol) return; // Not this player's turn
        if (!game.players.X || !game.players.O) return; // Wait for both players

        game.lastActivity = Date.now();
        game.board[index] = currentSymbol;

        // Check for winner
        let hasWinner = false;
        for (const pattern of WIN_PATTERNS) {
            const [a, b, c] = pattern;
            if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
                game.winner = currentSymbol;
                game.scores[currentSymbol]++;
                hasWinner = true;
                break;
            }
        }

        if (!hasWinner && !game.board.includes(null)) {
            game.winner = 'Draw';
        }

        if (!game.winner) {
            game.turn = currentSymbol === 'X' ? 'O' : 'X';
        } else {
            // Round finished — record it for the leaderboard (fire-and-forget).
            const winnerName = game.winner === 'Draw' ? null : game.names[game.winner];
            db.recordMatch(game.names.X, game.names.O, winnerName, game.uids.X, game.uids.O);
        }

        io.to(currentGameId).emit('gameState', game);
    });

    socket.on('replay', () => {
        if (!currentGameId) return;
        const game = games[currentGameId];
        if (!game) return;

        game.lastActivity = Date.now();
        game.board = Array(9).fill(null);
        game.winner = null;
        game.starter = game.starter === 'X' ? 'O' : 'X';
        game.turn = game.starter;

        io.to(currentGameId).emit('gameState', game);
    });

    socket.on('disconnect', () => {
        if (currentGameId) {
            const game = games[currentGameId];
            if (game) {
                if (game.players.X === socket.id) game.players.X = null;
                if (game.players.O === socket.id) game.players.O = null;
                io.to(currentGameId).emit('playerDisconnected');
            }
        }
    });
});

// Periodic cleanup of inactive games
setInterval(() => {
    const now = Date.now();
    for (const gameId in games) {
        if (now - games[gameId].lastActivity > GAME_TIMEOUT) {
            delete games[gameId];
            activeGameCount--;
            console.log(`Cleaned up inactive game ${gameId}`);
        }
    }
    // Also drop expired per-IP rate-limit windows so gameCreationsByIp
    // doesn't grow without bound.
    for (const [ip, entry] of gameCreationsByIp) {
        if (now - entry.windowStart > GAMES_PER_IP_WINDOW_MS) {
            gameCreationsByIp.delete(ip);
        }
    }
}, 15 * 60 * 1000); // Check every 15 mins

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
