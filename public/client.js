const socket = io();
const T = (k, p) => (window.t ? t(k, p) : k);

// Parse game ID from URL
const gameId = window.location.pathname.substring(1);

if (!gameId || gameId.length !== 6) {
    window.location.href = '/';
}

const shareLinkEl = document.getElementById('shareLink');
shareLinkEl.textContent = window.location.href;

const copyBtn = document.getElementById('copyBtn');
// Captured lazily on first click (not at load time) so it reflects the
// already-localized label set by the i18n:room DOMContentLoaded handler.
let copyBtnLabel = null;
let copyResetTimer = null;
copyBtn.addEventListener('click', () => {
    if (copyBtnLabel === null) copyBtnLabel = copyBtn.textContent;
    navigator.clipboard.writeText(window.location.href);
    copyBtn.textContent = T('linkCopied');
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
        copyBtn.textContent = copyBtnLabel;
    }, 1800);
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

if (window.PlayerAccount) window.PlayerAccount.mountWidget('#hk-account');

const playerName = window.PlayerName.ensure();

// Firebase's persisted-session check resolves quickly but isn't instant --
// wait for the first auth callback (bounded by a short timeout) so a
// returning signed-in player's very first joinGame carries their idToken
// instead of joining anonymously and only linking on their *next* game.
async function getInitialIdToken() {
    if (!window.PlayerAccount) return null;
    return Promise.race([
        new Promise((resolve) => {
            const unsub = window.PlayerAccount.onAuthChange(async (user) => {
                unsub();
                resolve(user ? await window.PlayerAccount.getIdToken() : null);
            });
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
}

getInitialIdToken().then((idToken) => {
    socket.emit('joinGame', { gameId, name: playerName, idToken });
});

socket.on('joined', (data) => {
    mySymbol = data.symbol;
    if (mySymbol === 'Spectator') {
        statusMessage.textContent = T('spectating');
    } else {
        statusMessage.textContent = T('waitingOpponent', { sym: mySymbol });
    }
});

socket.on('error', (msg) => {
    if (window.SFX) SFX.play('error');
    alert(msg);
    window.location.href = '/';
});

function label(sym) {
    const nm = currentGameState && currentGameState.names && currentGameState.names[sym];
    return nm ? `${sym} (${nm})` : sym;
}

let lastWinner = null;
let lastBothPlayers = false;
socket.on('gameState', (game) => {
    const prevBoard = lastRenderedBoard;
    currentGameState = game;
    updateBoard(game.board);
    if (window.SFX) {
        // Sounds only for changes after the first render, so joining mid-game stays silent.
        if (prevBoard) {
            game.board.forEach((v, i) => {
                if (v && !prevBoard[i]) SFX.play(v === 'X' ? 'place' : 'place2');
            });
        }
        if (game.winner && !lastWinner) {
            if (game.winner === 'Draw') SFX.play('draw');
            else if (mySymbol === 'Spectator') SFX.play('click');
            else SFX.play(game.winner === mySymbol ? 'win' : 'lose');
        } else if (!game.winner) {
            const both = !!(game.players.X && game.players.O);
            if (both && !lastBothPlayers && mySymbol !== 'Spectator') SFX.play('join');
            else if (prevBoard && game.turn === mySymbol && game.board.some((v, i) => v !== prevBoard[i])) SFX.play('turn');
        }
        lastBothPlayers = !!(game.players.X && game.players.O);
    }
    lastWinner = game.winner || null;
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
    if (window.SFX) SFX.play('click');
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
