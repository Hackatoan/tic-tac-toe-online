const socket = io();

// Parse game ID from URL
const gameId = window.location.pathname.substring(1);

if (!gameId || gameId.length !== 6) {
    window.location.href = '/';
}

const shareLinkEl = document.getElementById('shareLink');
shareLinkEl.textContent = window.location.href;

document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
});

const statusMessage = document.getElementById('statusMessage');
const scoreX = document.getElementById('scoreX');
const scoreO = document.getElementById('scoreO');
const cells = document.querySelectorAll('.cell');
const replayBtn = document.getElementById('replayBtn');

let mySymbol = null;
let currentGameState = null;

socket.emit('joinGame', gameId);

socket.on('joined', (data) => {
    mySymbol = data.symbol;
    if (mySymbol === 'Spectator') {
        statusMessage.textContent = 'You are spectating this game.';
    } else {
        statusMessage.textContent = `You are playing as ${mySymbol}. Waiting for opponent...`;
    }
});

socket.on('error', (msg) => {
    alert(msg);
    window.location.href = '/';
});

socket.on('gameState', (game) => {
    currentGameState = game;
    updateBoard(game.board);
    scoreX.textContent = game.scores.X;
    scoreO.textContent = game.scores.O;

    if (game.winner) {
        if (game.winner === 'Draw') {
            statusMessage.textContent = "It's a draw!";
        } else {
            statusMessage.textContent = `${game.winner} wins!`;
        }
        if (mySymbol !== 'Spectator') {
            replayBtn.style.display = 'inline-block';
        }
    } else {
        replayBtn.style.display = 'none';
        if (!game.players.X || !game.players.O) {
            statusMessage.textContent = `You are ${mySymbol}. Waiting for an opponent to join...`;
        } else if (mySymbol === 'Spectator') {
            statusMessage.textContent = `It is ${game.turn}'s turn.`;
        } else if (game.turn === mySymbol) {
            statusMessage.textContent = "It's your turn!";
        } else {
            statusMessage.textContent = `Waiting for ${game.turn} to make a move...`;
        }
    }
});

socket.on('playerDisconnected', () => {
    statusMessage.textContent = 'A player disconnected. Waiting for them to return or a new player...';
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
