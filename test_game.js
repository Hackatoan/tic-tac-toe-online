const io = require('socket.io-client');
const fetch = require('node-fetch');

async function runTest() {
    console.log("Starting server...");
    const { exec } = require('child_process');
    const serverProcess = exec('node index.js');

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        console.log("Creating games to test 50/50 starting player...");
        let starters = { 'X': 0, 'O': 0 };
        for (let i = 0; i < 20; i++) {
            const res = await fetch('http://localhost:3000/api/games', { method: 'POST' });
            const data = await res.json();

            const gameId = data.gameId;
            const socket = io('http://localhost:3000');

            await new Promise((resolve) => {
                socket.on('connect', () => {
                    socket.emit('joinGame', gameId);
                });
                socket.on('gameState', (game) => {
                    if (game.starter) {
                        starters[game.starter]++;
                        socket.disconnect();
                        resolve();
                    }
                });
            });
        }
        console.log(`Starter stats over 20 games: X: ${starters['X']}, O: ${starters['O']}`);

        console.log("Testing clean URL...");
        const res = await fetch('http://localhost:3000/api/games', { method: 'POST' });
        const data = await res.json();
        const gameId = data.gameId;

        const htmlRes = await fetch(`http://localhost:3000/${gameId}`);
        if (htmlRes.ok && (await htmlRes.text()).includes('Tic Tac Toe')) {
            console.log("Clean URL works!");
        } else {
            console.error("Clean URL failed.");
        }

        console.log("Testing rematch alternate logic...");
        const socket1 = io('http://localhost:3000');
        let initialStarter = null;
        let p1Symbol = null;

        await new Promise((resolve) => {
            socket1.on('connect', () => {
                socket1.emit('joinGame', gameId);
            });
            socket1.on('joined', (data) => {
                p1Symbol = data.symbol;
            });
            socket1.on('gameState', (game) => {
                if (game.starter && !initialStarter) {
                    initialStarter = game.starter;
                    console.log(`Initial starter is ${initialStarter}`);
                    socket1.emit('replay');
                } else if (initialStarter && game.starter && game.starter !== initialStarter) {
                    console.log(`Rematch starter correctly alternated to ${game.starter}`);
                    socket1.disconnect();
                    resolve();
                }
            });
        });

    } catch (e) {
        console.error(e);
    } finally {
        serverProcess.kill();
        process.exit();
    }
}

runTest();
