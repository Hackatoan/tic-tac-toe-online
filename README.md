# Tic-Tac-Toe Online

![Tic-Tac-Toe Online](https://ttt.hackatoa.com/og.svg)

Play the classic 3×3 game online — challenge a friend in real time or take on the AI.

**▶ Play at [ttt.hackatoa.com](https://ttt.hackatoa.com)**

## Features

- Real-time multiplayer via shareable link
- **Solo mode** — play vs AI with Easy, Medium, or Hard difficulty
- Hard mode uses **minimax with alpha-beta pruning** (perfect play)
- Score tracking across rounds
- No account or download required

## How to play

1. Open [ttt.hackatoa.com](https://ttt.hackatoa.com)
2. **vs Friend** → share the link with your opponent
3. **vs AI** → pick a difficulty and play immediately

## Tech stack

- Node.js + Express
- Socket.io (real-time multiplayer)
- Vanilla HTML/CSS/JS (zero build step)
- Docker + GitHub Actions CI/CD

## Self-hosting

```bash
docker run -p 3000:3000 ghcr.io/hackatoan/tic-tac-toe-online:latest
```

---

Part of [Hackatoa Games](https://games.hackatoa.com) · [Buy me a coffee](https://buymeacoffee.com/hackatoa)
