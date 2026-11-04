'use strict';

// Brief audio helpers: byte ranges, the MP3 encode through ffmpeg (a real
// encode when ffmpeg is installed, a mocked spawn otherwise). Clips are
// generated silence.
const childProcess = require('child_process');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { encodeWav } = require('../../../modules/daily-plan/brief/wav');
const audio = require('../../../modules/daily-plan/brief/audio');

const wavOfSeconds = (seconds) => {
    const sampleRate = 22050;
    const data = Buffer.alloc(Math.round(seconds * sampleRate) * 2);
    return encodeWav({ channels: 1, sampleRate, bitsPerSample: 16, data });
};

const hasFfmpeg = childProcess.spawnSync('ffmpeg', ['-version']).status === 0;

describe('parseRange', () => {
    it('returns null when there is no usable range', () => {
        expect(audio.parseRange(undefined, 100)).toBeNull();
        expect(audio.parseRange('pages=1-2', 100)).toBeNull();
        expect(audio.parseRange('bytes=0-1,5-6', 100)).toBeNull();
    });

    it('reads closed, open and suffix ranges', () => {
        expect(audio.parseRange('bytes=10-19', 100)).toEqual({
            start: 10,
            end: 19,
        });
        expect(audio.parseRange('bytes=90-', 100)).toEqual({
            start: 90,
            end: 99,
        });
        expect(audio.parseRange('bytes=-30', 100)).toEqual({
            start: 70,
            end: 99,
        });
    });

    it('clips an end past the file', () => {
        expect(audio.parseRange('bytes=90-500', 100)).toEqual({
            start: 90,
            end: 99,
        });
    });

    it('marks ranges outside the file as unsatisfiable', () => {
        expect(audio.parseRange('bytes=100-', 100)).toBe('unsatisfiable');
        expect(audio.parseRange('bytes=50-10', 100)).toBe('unsatisfiable');
        expect(audio.parseRange('bytes=-0', 100)).toBe('unsatisfiable');
        expect(audio.parseRange('bytes=0-0', 0)).toBe('unsatisfiable');
    });
});

describe('encodeMp3', () => {
    beforeEach(() => audio.resetFfmpegCheck());

    (hasFfmpeg ? describe : describe.skip)('with ffmpeg installed', () => {
        it('encodes a WAV into an MP3', async () => {
            const mp3 = await audio.encodeMp3(wavOfSeconds(2));
            expect(mp3.length).toBeGreaterThan(1000);
            const isId3 = mp3.toString('ascii', 0, 3) === 'ID3';
            const isFrame = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
            expect(isId3 || isFrame).toBe(true);
        });
    });

    describe('without ffmpeg', () => {
        let spawnSpy;

        const fakeChild = () => {
            const child = new EventEmitter();
            child.stdin = new PassThrough();
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            return child;
        };

        beforeEach(() => {
            spawnSpy = jest
                .spyOn(childProcess, 'spawn')
                .mockImplementation(() => {
                    const child = fakeChild();
                    process.nextTick(() => {
                        const error = new Error('spawn ffmpeg ENOENT');
                        error.code = 'ENOENT';
                        child.emit('error', error);
                    });
                    return child;
                });
        });

        afterEach(() => spawnSpy.mockRestore());

        it('reports ffmpeg_missing when the binary cannot be started', async () => {
            await expect(
                audio.encodeMp3(wavOfSeconds(1))
            ).rejects.toMatchObject({
                code: 'ffmpeg_missing',
            });
        });

        it('checks for ffmpeg once per process', async () => {
            await audio.ffmpegInstalled();
            await audio.ffmpegInstalled();
            const probes = spawnSpy.mock.calls.filter(
                ([command]) => command === 'ffmpeg'
            );
            expect(probes).toHaveLength(1);
        });

        it('spawns ffmpeg with an argument array and no shell', async () => {
            audio.resetFfmpegCheck();
            spawnSpy.mockImplementation(() => {
                const child = fakeChild();
                process.nextTick(() => child.emit('close', 0));
                return child;
            });
            await audio.encodeMp3(wavOfSeconds(1));
            const [command, args, options] = spawnSpy.mock.calls.at(-1);
            expect(command).toBe('ffmpeg');
            expect(Array.isArray(args)).toBe(true);
            expect(args).toEqual(
                expect.arrayContaining([
                    '-i',
                    'pipe:0',
                    '-b:a',
                    '48k',
                    'pipe:1',
                ])
            );
            expect(options.shell).toBeUndefined();
        });

        it('reports ffmpeg_error when ffmpeg exits with a failure', async () => {
            audio.resetFfmpegCheck();
            spawnSpy.mockImplementation(() => {
                const child = fakeChild();
                process.nextTick(() => child.emit('close', 1));
                return child;
            });
            await expect(
                audio.encodeMp3(wavOfSeconds(1))
            ).rejects.toMatchObject({
                code: 'ffmpeg_error',
            });
        });
    });
});
