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

cells.forEach(cell => {
    cell.addEventListener('click', (e) => {
        if (mySymbol === 'Spectator') return;
        if (!currentGameState || currentGameState.winner) return;
        if (currentGameState.turn !== mySymbol) return;

        const index = e.target.getAttribute('data-index');
        if (currentGameState.board[index] === null) {
            socket.emit('makeMove', index);
        }
    });
});

replayBtn.addEventListener('click', () => {
    socket.emit('replay');
});

function updateBoard(board) {
    cells.forEach((cell, index) => {
        cell.textContent = board[index] || '';
        cell.className = 'cell'; // reset classes
        if (board[index] === 'X') cell.classList.add('x');
        if (board[index] === 'O') cell.classList.add('o');
    });
}
