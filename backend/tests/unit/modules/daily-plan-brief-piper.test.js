'use strict';

// The WAV helpers and the Piper client, against a fake Piper server on
// 127.0.0.1. The text sent is fictitious.
const http = require('http');
const {
    WavFormatError,
    encodeWav,
    joinWithSilence,
    parseWav,
} = require('../../../modules/daily-plan/brief/wav');
const piper = require('../../../modules/daily-plan/brief/piper');

// A PCM WAV of `seconds` of silence: 16-bit mono at 22050 Hz by default.
const makeWav = (
    seconds,
    { sampleRate = 22050, channels = 1, bitsPerSample = 16 } = {}
) => {
    const blockAlign = (channels * bitsPerSample) / 8;
    const data = Buffer.alloc(Math.round(seconds * sampleRate) * blockAlign);
    return encodeWav({ channels, sampleRate, bitsPerSample, data });
};

describe('parseWav', () => {
    it('reads the format and the duration of a WAV', () => {
        const parsed = parseWav(makeWav(2));
        expect(parsed).toMatchObject({
            audioFormat: 1,
            channels: 1,
            sampleRate: 22050,
            bitsPerSample: 16,
            blockAlign: 2,
            byteRate: 44100,
        });
        expect(parsed.durationSeconds).toBeCloseTo(2, 5);
        expect(parsed.data.length).toBe(88200);
    });

    it('skips unknown chunks before the format', () => {
        const wav = makeWav(1);
        const extra = Buffer.from('LIST\x04\x00\x00\x00abcd', 'binary');
        const withExtra = Buffer.concat([
            wav.subarray(0, 12),
            extra,
            wav.subarray(12),
        ]);
        expect(parseWav(withExtra).durationSeconds).toBeCloseTo(1, 5);
    });

    it('accepts a data size that runs past the end of the file', () => {
        const wav = makeWav(1);
        wav.writeUInt32LE(0xffffffff, 40);
        expect(parseWav(wav).durationSeconds).toBeCloseTo(1, 5);
    });

    it.each([
        ['not a RIFF file', Buffer.from('hello world, not audio')],
        [
            'a non-PCM format',
            (() => {
                const w = makeWav(1);
                w.writeUInt16LE(3, 20);
                return w;
            })(),
        ],
        ['no data chunk', makeWav(1).subarray(0, 36)],
    ])('refuses %s with piper_error', (_label, buffer) => {
        let error;
        try {
            parseWav(buffer);
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(WavFormatError);
        expect(error.code).toBe('piper_error');
    });
});

describe('joinWithSilence', () => {
    it('places each chapter after the previous one and the silence between them', () => {
        const clips = [
            parseWav(makeWav(2)),
            parseWav(makeWav(3)),
            parseWav(makeWav(1)),
        ];
        const joined = joinWithSilence(clips, 0.8);
        expect(joined.starts[0]).toBe(0);
        expect(joined.starts[1]).toBeCloseTo(2.8, 3);
        expect(joined.starts[2]).toBeCloseTo(2.8 + 3 + 0.8, 3);
        expect(joined.durationSeconds).toBeCloseTo(2 + 3 + 1 + 1.6, 3);

        const parsed = parseWav(joined.wav);
        expect(parsed.durationSeconds).toBeCloseTo(joined.durationSeconds, 3);
    });

    it('refuses clips of different formats', () => {
        const clips = [
            parseWav(makeWav(1)),
            parseWav(makeWav(1, { sampleRate: 16000 })),
        ];
        expect(() => joinWithSilence(clips, 0.8)).toThrow(WavFormatError);
    });
});

describe('Piper client', () => {
    let server;
    let baseUrl;
    let calls;
    let mode;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                calls.push({ method: req.method, url: req.url, body });
                if (mode === 'slow') {
                    setTimeout(() => res.end(makeWav(1)), 500);
                    return;
                }
                if (req.method === 'POST' && req.url === '/synthesize') {
                    if (mode === 'error') {
                        res.writeHead(500).end('boom');
                        return;
                    }
                    if (mode === 'not-wav') {
                        res.writeHead(200, { 'Content-Type': 'audio/wav' }).end(
                            'text'
                        );
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'audio/wav' }).end(
                        makeWav(1)
                    );
                    return;
                }
                if (req.method === 'GET' && req.url === '/voices') {
                    if (mode === 'voices-not-json') {
                        res.writeHead(200).end('<html>');
                        return;
                    }
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                    }).end(
                        JSON.stringify({
                            'fr_FR-fictif-medium': {},
                            'fr_FR-exemple-low': {},
                        })
                    );
                    return;
                }
                res.writeHead(404).end();
            });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}/`;
    });

    beforeEach(() => {
        calls = [];
        mode = 'ok';
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    it('synthesizes a WAV with the voice, and length_scale as the inverse of the speed', async () => {
        const wav = await piper.synthesize({
            piperUrl: baseUrl,
            voice: 'fr_FR-fictif-medium',
            speed: 1.25,
            text: 'Bonjour, texte fictif.',
        });
        expect(parseWav(wav).durationSeconds).toBeCloseTo(1, 5);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ method: 'POST', url: '/synthesize' });
        expect(JSON.parse(calls[0].body)).toEqual({
            text: 'Bonjour, texte fictif.',
            voice: 'fr_FR-fictif-medium',
            length_scale: 0.8,
        });
    });

    it('lists the voice ids, sorted', async () => {
        expect(await piper.listVoices(baseUrl)).toEqual([
            'fr_FR-exemple-low',
            'fr_FR-fictif-medium',
        ]);
        expect(calls[0]).toMatchObject({ method: 'GET', url: '/voices' });
    });

    it('reports a working server from checkPiper', async () => {
        expect(await piper.checkPiper(baseUrl)).toEqual({
            ok: true,
            code: null,
        });
    });

    it('reports an unreachable server without throwing', async () => {
        const closed = http.createServer();
        await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
        const port = closed.address().port;
        await new Promise((resolve) => closed.close(resolve));
        expect(await piper.checkPiper(`http://127.0.0.1:${port}`)).toEqual({
            ok: false,
            code: 'piper_unreachable',
        });
    });

    it('answers piper_error for an HTTP error, a non-WAV body or a non-JSON voice list', async () => {
        mode = 'error';
        await expect(
            piper.synthesize({ piperUrl: baseUrl, voice: 'v', text: 't' })
        ).rejects.toMatchObject({ code: 'piper_error' });

        mode = 'not-wav';
        await expect(
            piper.synthesize({ piperUrl: baseUrl, voice: 'v', text: 't' })
        ).rejects.toMatchObject({ code: 'piper_error' });

        mode = 'voices-not-json';
        await expect(piper.listVoices(baseUrl)).rejects.toMatchObject({
            code: 'piper_error',
        });
    });

    it('times out with piper_unreachable', async () => {
        mode = 'slow';
        await expect(
            piper.synthesize({
                piperUrl: baseUrl,
                voice: 'v',
                text: 't',
                timeoutMs: 50,
            })
        ).rejects.toMatchObject({ code: 'piper_unreachable' });
    });

    it.each([
        ['the metadata address', 'http://169.254.169.254/'],
        ['the metadata name', 'http://metadata.google.internal/'],
        ['a link-local IPv6 address', 'http://[fe80::1]:5000/'],
        ['a non-http scheme', 'file:///etc/passwd'],
        ['credentials in the address', 'http://user:secret@127.0.0.1:5000/'],
        ['an empty address', ''],
    ])('refuses %s', async (_label, url) => {
        await expect(piper.listVoices(url)).rejects.toMatchObject({
            code: 'piper_url_invalid',
        });
        expect(calls).toHaveLength(0);
    });

    it('accepts private and loopback addresses', () => {
        expect(piper.piperBase('http://10.0.0.20:5000/')).toBe(
            'http://10.0.0.20:5000'
        );
        expect(piper.piperBase('http://127.0.0.1:5000')).toBe(
            'http://127.0.0.1:5000'
        );
    });
});
