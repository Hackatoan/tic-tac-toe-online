const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory game state store
const games = {};

// Clean up games that haven't been touched in a while (e.g., 1 hour)
const GAME_TIMEOUT = 60 * 60 * 1000;

function createGame() {
    const gameId = generateShortId();
    const starter = Math.random() < 0.5 ? 'X' : 'O';
    games[gameId] = {
        board: Array(9).fill(null),
        players: { X: null, O: null },
        scores: { X: 0, O: 0 },
        turn: starter,
        starter: starter,
        winner: null,
        lastActivity: Date.now()
    };
    return gameId;
}

// REST endpoint to create a new game
app.post('/api/games', (req, res) => {
    const gameId = createGame();
    res.json({ gameId });
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

    socket.on('joinGame', (gameId) => {
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
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        let hasWinner = false;
        for (const pattern of winPatterns) {
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
            console.log(`Cleaned up inactive game ${gameId}`);
        }
    }
}, 15 * 60 * 1000); // Check every 15 mins

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
