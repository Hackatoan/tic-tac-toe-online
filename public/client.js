const socket = io();
const T = (k, p) => (window.t ? t(k, p) : k);

// Parse game ID from URL
const gameId = window.location.pathname.substring(1);

if (!gameId || gameId.length !== 6) {
    window.location.href = '/';
}

const shareLinkEl = document.getElementById('shareLink');
shareLinkEl.textContent = window.location.href;

document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    alert(T('linkCopied'));
});

const statusMessage = document.getElementById('statusMessage');
const scoreX = document.getElementById('scoreX');
const scoreO = document.getElementById('scoreO');
const nameX = document.getElementById('nameX');
const nameO = document.getElementById('nameO');
const cells = document.querySelectorAll('.cell');
const replayBtn = document.getElementById('replayBtn');

let mySymbol = null;
let currentGameState = null;
let lastRenderedBoard = null;

const playerName = window.PlayerName.ensure();
socket.emit('joinGame', { gameId, name: playerName });

socket.on('joined', (data) => {
    mySymbol = data.symbol;
    if (mySymbol === 'Spectator') {
        statusMessage.textContent = T('spectating');
    } else {
        statusMessage.textContent = T('waitingOpponent', { sym: mySymbol });
    }
});

socket.on('error', (msg) => {
    alert(msg);
    window.location.href = '/';
});

function label(sym) {
    const nm = currentGameState && currentGameState.names && currentGameState.names[sym];
    return nm ? `${sym} (${nm})` : sym;
}

socket.on('gameState', (game) => {
    currentGameState = game;
    updateBoard(game.board);
    scoreX.textContent = game.scores.X;
    scoreO.textContent = game.scores.O;
    if (nameX) nameX.textContent = game.names && game.names.X ? game.names.X : '—';
    if (nameO) nameO.textContent = game.names && game.names.O ? game.names.O : '—';

    if (game.winner) {
        if (game.winner === 'Draw') {
            statusMessage.textContent = T('draw');
        } else {
            statusMessage.textContent = T('winner', { label: label(game.winner) });
        }
        if (mySymbol !== 'Spectator') {
            replayBtn.style.display = 'inline-block';
        }
    } else {
        replayBtn.style.display = 'none';
        if (!game.players.X || !game.players.O) {
            statusMessage.textContent = T('waitingJoin', { sym: mySymbol });
        } else if (mySymbol === 'Spectator') {
            statusMessage.textContent = T('itsTurn', { label: label(game.turn) });
        } else if (game.turn === mySymbol) {
            statusMessage.textContent = T('yourTurn');
        } else {
            statusMessage.textContent = T('waitingMove', { label: label(game.turn) });
        }
    }
});

socket.on('playerDisconnected', () => {
    statusMessage.textContent = T('disconnected');
});

function tryMove(cell) {
    if (mySymbol === 'Spectator') return;
    if (!currentGameState || currentGameState.winner) return;
    if (currentGameState.turn !== mySymbol) return;

    const index = cell.getAttribute('data-index');
    if (currentGameState.board[index] === null) {
        socket.emit('makeMove', index);
    }
}

cells.forEach(cell => {
    cell.addEventListener('click', (e) => tryMove(e.currentTarget));
    cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            tryMove(e.currentTarget);
        }
    });
});

replayBtn.addEventListener('click', () => {
    socket.emit('replay');
});

function updateBoard(board) {
    cells.forEach((cell, index) => {
        // Skip cells whose value hasn't changed since the last render — a
        // gameState broadcast only ever changes at most one cell, so
        // touching all 9 every time is 9x the necessary DOM writes/reflows.
        if (lastRenderedBoard && lastRenderedBoard[index] === board[index]) return;

        cell.textContent = board[index] || '';
        cell.className = 'cell'; // reset classes
        if (board[index] === 'X') cell.classList.add('x');
        if (board[index] === 'O') cell.classList.add('o');
        const row = Math.floor(index / 3) + 1;
        const col = (index % 3) + 1;
        cell.setAttribute('aria-label', `Row ${row}, column ${col}, ${board[index] || 'empty'}`);
    });
    lastRenderedBoard = board.slice();
}
