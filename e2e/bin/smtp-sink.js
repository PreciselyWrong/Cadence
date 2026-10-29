#!/usr/bin/env node
// Minimal SMTP sink for the e2e run: accepts every message and drops it,
// so flows that send an email (registration) can complete.
const net = require('net');

const port = Number(process.env.SMTP_SINK_PORT || 2525);
const host = process.env.SMTP_SINK_HOST || '127.0.0.1';

net.createServer((socket) => {
    let inData = false;
    let buffer = '';
    const reply = (line) => socket.write(line + '\r\n');
    reply('220 e2e-smtp-sink ready');
    socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\r\n')) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (inData) {
                if (line === '.') {
                    inData = false;
                    reply('250 OK queued');
                }
                continue;
            }
            const cmd = line.slice(0, 4).toUpperCase();
            if (cmd === 'EHLO') {
                reply('250-e2e-smtp-sink');
                reply('250 8BITMIME');
            } else if (cmd === 'HELO') {
                reply('250 e2e-smtp-sink');
            } else if (cmd === 'DATA') {
                inData = true;
                reply('354 End data with <CR><LF>.<CR><LF>');
            } else if (cmd === 'QUIT') {
                reply('221 Bye');
                socket.end();
            } else {
                reply('250 OK');
            }
        }
    });
    socket.on('error', () => {});
}).listen(port, host);
