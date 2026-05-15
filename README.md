[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/hackatoa)

# Tic-Tac-Toe Online

Real-time 2-player Tic-Tac-Toe in the browser. Share a link, play instantly — no account needed.

**Live:** [ttc.hackatoa.com](https://ttc.hackatoa.com)

## Running locally

```bash
git clone https://github.com/Hackatoan/tic-tac-toe-online
cd tic-tac-toe-online
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy

Containerized with Docker. Auto-deploys on push to main via GitHub Actions.

```bash
docker build -t tic-tac-toe-online .
docker run -p 3000:3000 tic-tac-toe-online
```

---

[hackatoa.com](https://hackatoa.com) · [GitHub](https://github.com/Hackatoan) · [Buy Me A Coffee](https://buymeacoffee.com/hackatoa)
