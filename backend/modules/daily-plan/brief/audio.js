'use strict';

// Brief audio (docs/39-daily-brief.md, Audio). The spoken script of a brief is
// synthesized by the Piper server of the user, the chapters are joined with a
// short silence and encoded as MP3 by ffmpeg. The file lives under the uploads
// folder, in briefs/<user uid>/, which the static uploads route does not serve:
// uploadsAccessControl refuses every category it does not know. Clients get it
// through GET /daily-plan/:date/brief/audio only.
const childProcess = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { getConfig } = require('../../../config/config');
const { logger } = require('../../../services/logService');
const { ValidationError } = require('../../../shared/errors');
const { isValidUid } = require('../../../utils/uid');
const piper = require('./piper');
const { parseWav, joinWithSilence } = require('./wav');
const { cleanExternal } = require('./script');
const briefRepository = require('./repository');
const { getBriefSettings } = require('./service');
const { briefSettingsFromUiSettings } = require('./settings');

const SILENCE_SECONDS = 0.8;
const MP3_BITRATE = '48k';
const DEFAULT_AUDIO_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_MAX_CHARS = 200;
const PREVIEW_TEXT =
    'Bonjour, voici un aperçu de la voix de ton résumé matinal.';
const ERROR_CODES = new Set([
    'piper_unreachable',
    'piper_error',
    'piper_url_invalid',
    'ffmpeg_missing',
    'ffmpeg_error',
]);
const AUDIO_FILE = /^(\d{4}-\d{2}-\d{2})-v(\d+)\.mp3$/;

class AudioError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AudioError';
        this.code = code;
    }
}

// ffmpeg is looked for once per process: the answer does not change while
// the server runs.
let ffmpegCheck = null;

function ffmpegInstalled() {
    if (!ffmpegCheck) {
        ffmpegCheck = new Promise((resolve) => {
            const child = childProcess.spawn('ffmpeg', ['-version'], {
                stdio: 'ignore',
            });
            child.on('error', () => resolve(false));
            child.on('close', (code) => resolve(code === 0));
        });
    }
    return ffmpegCheck;
}

async function requireFfmpeg() {
    if (!(await ffmpegInstalled())) {
        throw new AudioError('ffmpeg_missing', 'ffmpeg is not installed');
    }
}

// MP3 mono 48 kbit/s from a WAV. Arguments are an array: no shell, and the
// audio goes through stdin and stdout, never through a file name.
function encodeMp3(wav) {
    return new Promise((resolve, reject) => {
        const args = [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            'pipe:0',
            '-vn',
            '-ac',
            '1',
            '-b:a',
            MP3_BITRATE,
            '-f',
            'mp3',
            'pipe:1',
        ];
        const child = childProcess.spawn('ffmpeg', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const out = [];
        child.stdout.on('data', (chunk) => out.push(chunk));
        child.stderr.resume();
        child.on('error', (error) => {
            reject(
                new AudioError(
                    error.code === 'ENOENT' ? 'ffmpeg_missing' : 'ffmpeg_error',
                    'ffmpeg could not run'
                )
            );
        });
        child.on('close', (code) => {
            if (code === 0) resolve(Buffer.concat(out));
            else reject(new AudioError('ffmpeg_error', 'ffmpeg failed'));
        });
        child.stdin.on('error', () => {});
        child.stdin.end(wav);
    });
}

const voiceReady = (settings) =>
    Boolean(
        settings.voice.enabled &&
        settings.voice.piperUrl &&
        settings.voice.voice
    );

// The audio state written with a new brief version.
function initialAudioState(settings) {
    return {
        status: voiceReady(settings) ? 'pending' : 'none',
        path: null,
        duration_seconds: null,
        chapters: [],
        voice: null,
        error: null,
    };
}

const audioRelativePath = (userUid, planDate, version) =>
    `briefs/${userUid}/${planDate}-v${version}.mp3`;

function uploadsRoot() {
    return getConfig().uploadPath;
}

// Writes through a temporary file so a reader never sees a partial MP3.
async function writeAudioFile(relativePath, buffer) {
    const target = path.join(uploadsRoot(), relativePath);
    const userDir = path.dirname(target);
    const briefsDir = path.dirname(userDir);
    await fsp.mkdir(userDir, { recursive: true, mode: 0o700 });
    await fsp.chmod(briefsDir, 0o700);
    await fsp.chmod(userDir, 0o700);
    const temporary = path.join(userDir, `.${path.basename(target)}.tmp`);
    await fsp.writeFile(temporary, buffer, { mode: 0o600 });
    await fsp.rename(temporary, target);
    return target;
}

// Writes the audio fields of one brief version. Nothing is written when the
// row has moved on (Regenerate): the caller then removes its file.
async function saveAudioIfCurrent(planRow, patch) {
    const row = await briefRepository.findPlanRowById(planRow.id);
    if (!row?.brief || row.brief_version !== planRow.brief_version)
        return false;
    await briefRepository.saveBriefIfVersion(
        planRow.id,
        planRow.brief_version,
        {
            brief: {
                ...row.brief,
                audio: { ...row.brief.audio, ...patch },
            },
        }
    );
    return true;
}

// Renders the audio of one brief version. `planRow` is the day's row as
// generated: id, plan_date, brief_version and brief (with audio_script). The
// brief stays usable whatever happens here: a failure only sets audio.status.
async function renderBriefAudio(user, planRow) {
    const settings = await getBriefSettings(user);
    if (!voiceReady(settings)) return false;
    const chapters = planRow.brief?.audio_script?.chapters ?? [];
    if (chapters.length === 0) return false;

    const { voice } = settings;
    let target = null;
    try {
        await requireFfmpeg();
        const clips = [];
        for (const chapter of chapters) {
            const wav = await piper.synthesize({
                piperUrl: voice.piperUrl,
                voice: voice.voice,
                speed: voice.speed,
                text: chapter.text,
            });
            clips.push(parseWav(wav));
        }
        const joined = joinWithSilence(clips, SILENCE_SECONDS);
        const mp3 = await encodeMp3(joined.wav);
        if (!isValidUid(user.uid)) {
            throw new AudioError('render_failed', 'invalid user uid');
        }
        const relativePath = audioRelativePath(
            user.uid,
            planRow.plan_date,
            planRow.brief_version
        );
        target = await writeAudioFile(relativePath, mp3);

        const saved = await saveAudioIfCurrent(planRow, {
            status: 'ready',
            path: relativePath,
            duration_seconds: Math.round(joined.durationSeconds * 100) / 100,
            chapters: chapters.map((chapter, index) => ({
                id: chapter.id,
                start_seconds: Math.round(joined.starts[index] * 100) / 100,
            })),
            voice: voice.voice,
            error: null,
        });
        if (!saved) await fsp.rm(target, { force: true });
        return saved;
    } catch (error) {
        const code = ERROR_CODES.has(error.code) ? error.code : 'render_failed';
        logger.error(
            { code, userId: user.id, version: planRow.brief_version },
            'Daily brief audio failed'
        );
        await saveAudioIfCurrent(planRow, {
            status: 'failed',
            path: null,
            duration_seconds: null,
            chapters: [],
            error: code,
        });
        return false;
    }
}

// The voices the user's Piper server has.
async function listVoicesForUser(user) {
    const settings = await getBriefSettings(user);
    if (!settings.voice.piperUrl) {
        throw new ValidationError('The Piper address is not set');
    }
    return piper.listVoices(settings.voice.piperUrl);
}

function validatePreview(body) {
    const voice = typeof body?.voice === 'string' ? body.voice.trim() : '';
    if (voice === '' || voice.length > 100) {
        throw new ValidationError(
            'voice must be a name of 1 to 100 characters'
        );
    }
    const speed = body.speed === undefined ? 1 : body.speed;
    if (typeof speed !== 'number' || speed < 0.5 || speed > 2) {
        throw new ValidationError('speed must be a number from 0.5 to 2');
    }
    let text = PREVIEW_TEXT;
    if (body.text !== undefined && body.text !== null) {
        if (typeof body.text !== 'string') {
            throw new ValidationError('text must be a string');
        }
        if (body.text.length > PREVIEW_MAX_CHARS) {
            throw new ValidationError(
                `text must be at most ${PREVIEW_MAX_CHARS} characters`
            );
        }
        text = cleanExternal(body.text) || PREVIEW_TEXT;
    }
    return { voice, speed, text };
}

// A short sample in the given voice. MP3 when ffmpeg is installed, WAV
// otherwise. Nothing is stored.
async function previewVoice(user, body) {
    const input = validatePreview(body);
    const settings = await getBriefSettings(user);
    if (!settings.voice.piperUrl) {
        throw new ValidationError('The Piper address is not set');
    }
    const wav = await piper.synthesize({
        piperUrl: settings.voice.piperUrl,
        voice: input.voice,
        speed: input.speed,
        text: input.text,
    });
    if (await ffmpegInstalled()) {
        return { body: await encodeMp3(wav), contentType: 'audio/mpeg' };
    }
    return { body: wav, contentType: 'audio/wav' };
}

// "bytes=a-b", "bytes=a-", "bytes=-n". Null when there is no usable range
// (the whole file is sent), 'unsatisfiable' when none of it is in the file.
function parseRange(header, size) {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
    if (!match || (match[1] === '' && match[2] === '')) return null;
    let start;
    let end;
    if (match[1] === '') {
        const suffix = Number(match[2]);
        if (suffix === 0) return 'unsatisfiable';
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (size === 0 || start > end || start >= size) return 'unsatisfiable';
    return { start, end };
}

// Streams an MP3 with byte ranges (seeking). Returns false when the file is
// missing, before anything is sent.
async function sendBriefAudio(req, res, filePath) {
    let stat;
    try {
        stat = await fsp.stat(filePath);
    } catch {
        return false;
    }
    const size = stat.size;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const range = parseRange(req.headers.range, size);
    if (range === 'unsatisfiable') {
        res.setHeader('Content-Range', `bytes */${size}`);
        res.status(416).end();
        return true;
    }
    if (range) {
        res.status(206);
        res.setHeader(
            'Content-Range',
            `bytes ${range.start}-${range.end}/${size}`
        );
        res.setHeader('Content-Length', range.end - range.start + 1);
    } else {
        res.setHeader('Content-Length', size);
    }
    if (req.method === 'HEAD') {
        res.end();
        return true;
    }
    const stream = fs.createReadStream(
        filePath,
        range ? { start: range.start, end: range.end } : undefined
    );
    stream.on('error', (error) => {
        logger.error({ code: error.code }, 'Daily brief audio read failed');
        res.destroy(error);
    });
    stream.pipe(res);
    return true;
}

// Deletes the MP3 files older than the owner's retention.audioDays and marks
// their brief as expired. A file whose owner is gone keeps the default.
async function purgeBriefAudio({ now = new Date() } = {}) {
    const root = path.join(uploadsRoot(), 'briefs');
    let folders;
    try {
        folders = await fsp.readdir(root);
    } catch (error) {
        if (error.code === 'ENOENT') return { deleted: 0 };
        throw error;
    }

    let deleted = 0;
    for (const uid of folders) {
        if (!isValidUid(uid)) continue;
        const folder = path.join(root, uid);
        const owner = await briefRepository.findUserByUid(uid);
        const days = owner
            ? briefSettingsFromUiSettings(owner.ui_settings).retention.audioDays
            : DEFAULT_AUDIO_DAYS;
        const cutoff = now.getTime() - days * DAY_MS;
        const names = await fsp.readdir(folder).catch(() => []);
        for (const name of names) {
            const match = AUDIO_FILE.exec(name);
            if (!match) continue;
            const file = path.join(folder, name);
            const stat = await fsp.stat(file).catch(() => null);
            if (!stat || stat.mtimeMs > cutoff) continue;
            await fsp.rm(file, { force: true });
            deleted += 1;
            if (!owner) continue;
            const row = await briefRepository.findPlanRowByDate(
                owner.id,
                match[1]
            );
            if (row?.brief?.audio?.path === `briefs/${uid}/${name}`) {
                await briefRepository.saveBriefIfVersion(
                    row.id,
                    row.brief_version,
                    {
                        brief: {
                            ...row.brief,
                            audio: { ...row.brief.audio, status: 'expired' },
                        },
                    }
                );
            }
        }
    }
    return { deleted };
}

module.exports = {
    AudioError,
    audioRelativePath,
    encodeMp3,
    ffmpegInstalled,
    initialAudioState,
    listVoicesForUser,
    parseRange,
    previewVoice,
    purgeBriefAudio,
    renderBriefAudio,
    resetFfmpegCheck: () => {
        ffmpegCheck = null;
    },
    sendBriefAudio,
    voiceReady,
};
