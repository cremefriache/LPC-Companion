import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

export async function launchBrowser() {
    return chromium.launch({
        executablePath: process.env.LPC_CHROME ?? '/usr/bin/google-chrome',
        headless: true,
        args: ['--no-sandbox'],
    });
}

export async function serve(handler) {
    const server = http.createServer((request, response) => {
        Promise.resolve(handler(request, response)).catch(() => {
            response.writeHead(500).end();
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
    };
}

export async function freePort() {
    const socket = net.createServer();
    await new Promise((resolve, reject) => {
        socket.once('error', reject);
        socket.listen(0, '127.0.0.1', resolve);
    });
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    return port;
}
