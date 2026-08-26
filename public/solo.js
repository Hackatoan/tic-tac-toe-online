const cells = document.querySelectorAll('.cell');
const statusEl = document.getElementById('statusMessage');
const T = (k, p) => (window.t ? t(k, p) : k);
const scoreXEl = document.getElementById('scoreX');
const scoreOEl = document.getElementById('scoreO');
const replayBtn = document.getElementById('replayBtn');
const diffBtns = document.querySelectorAll('.diff-btn');

const WIN_PATTERNS = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
];

let board = Array(9).fill(null);
let gameOver = false;
let difficulty = 'easy';
let scores = { X: 0, O: 0 };
let aiTimer = null;
// Player is always X (goes first), AI is O
const P = 'X', A = 'O';

// ── Helpers ──

function getEmpties(b) {
    return b.reduce((acc, v, i) => { if (v === null) acc.push(i); return acc; }, []);
}

function checkResult(b) {
    for (const [a, bb, c] of WIN_PATTERNS) {
        if (b[a] && b[a] === b[bb] && b[a] === b[c]) return b[a];
    }
    return b.includes(null) ? null : 'Draw';
}

// ── AI strategies ──

function randomPick(b) {
    const e = getEmpties(b);
    return e[Math.floor(Math.random() * e.length)];
}

function findThreat(b, sym) {
    for (const [a, bb, c] of WIN_PATTERNS) {
        const vals = [b[a], b[bb], b[c]];
        if (vals.filter(v => v === sym).length === 2 && vals.includes(null)) {
            return [a, bb, c].find(i => b[i] === null);
        }
    }
    return null;
}

function minimax(b, isMax, depth, alpha, beta) {
    const res = checkResult(b);
    if (res === A) return 10 - depth;
    if (res === P) return depth - 10;
    if (res === 'Draw') return 0;

    const empties = getEmpties(b);
    if (isMax) {
        let best = -Infinity;
        for (const i of empties) {
            b[i] = A;
            best = Math.max(best, minimax(b, false, depth + 1, alpha, beta));
            b[i] = null;
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const i of empties) {
            b[i] = P;
            best = Math.min(best, minimax(b, true, depth + 1, alpha, beta));
            b[i] = null;
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}

function bestMinimaxMove(b) {
    let best = -Infinity, move = -1;
    for (const i of getEmpties(b)) {
        b[i] = A;
        const score = minimax(b, false, 0, -Infinity, Infinity);
        b[i] = null;
        if (score > best) { best = score; move = i; }
    }
    return move;
}

function getAIMove() {
    if (difficulty === 'easy') return randomPick(board);

    if (difficulty === 'medium') {
        const win = findThreat(board, A);
        if (win !== null) return win;
        const block = findThreat(board, P);
        if (block !== null) return block;
        if (board[4] === null) return 4;
        const corners = [0, 2, 6, 8].filter(i => board[i] === null);
        if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
        return randomPick(board);
    }

    // hard: minimax with alpha-beta
    return bestMinimaxMove(board);
}

// ── Game logic ──

function applyMove(index, sym) {
    board[index] = sym;
    cells[index].textContent = sym;
    cells[index].className = 'cell ' + sym.toLowerCase();

    const result = checkResult(board);
    if (result) {
        gameOver = true;
        replayBtn.style.display = 'inline-block';
        if (result === 'Draw') {
            statusEl.textContent = T('itsDraw');
        } else if (result === P) {
            statusEl.textContent = T('youWin');
            scores.X++;
            scoreXEl.textContent = scores.X;
        } else {
            statusEl.textContent = T('aiWins');
            scores.O++;
            scoreOEl.textContent = scores.O;
        }
        return;
    }

    if (sym === P) {
        statusEl.innerHTML = '<span class="ai-thinking">' + T('aiThinking') + '</span>';
        const delay = difficulty === 'easy' ? 600 : difficulty === 'medium' ? 380 : 180;
        aiTimer = setTimeout(() => {
            if (!gameOver) {
                const move = getAIMove();
                if (move !== undefined && move !== -1) applyMove(move, A);
            }
        }, delay);
    } else {
        statusEl.textContent = T('yourTurn');
    }
}

function resetGame() {
    clearTimeout(aiTimer);
    board = Array(9).fill(null);
    gameOver = false;
    replayBtn.style.display = 'none';
    cells.forEach(c => { c.textContent = ''; c.className = 'cell'; });
    statusEl.textContent = T('yourTurn');
}

// ── Event listeners ──

cells.forEach(cell => {
    cell.addEventListener('click', () => {
        const index = parseInt(cell.getAttribute('data-index'));
        if (gameOver || board[index] !== null) return;
        // Only allow click when it's the player's turn (i.e., no AI pending)
        if (statusEl.querySelector('.ai-thinking')) return;
        applyMove(index, P);
    });
});

diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        difficulty = btn.getAttribute('data-level');
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        resetGame();
    });
});

replayBtn.addEventListener('click', resetGame);
