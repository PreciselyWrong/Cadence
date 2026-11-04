'use strict';

// RIFF/WAVE helpers for the Piper output of the brief audio: read the header,
// join the chapters with silences and write the result back as a WAV file.
// Piper answers with 16-bit PCM; anything else is refused.

class WavFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WavFormatError';
        this.code = 'piper_error';
    }
}

const PCM_FORMAT = 1;

// { channels, sampleRate, bitsPerSample, blockAlign, byteRate, data, durationSeconds }
function parseWav(buffer) {
    if (
        !Buffer.isBuffer(buffer) ||
        buffer.length < 12 ||
        buffer.toString('ascii', 0, 4) !== 'RIFF' ||
        buffer.toString('ascii', 8, 12) !== 'WAVE'
    ) {
        throw new WavFormatError('Not a WAV file');
    }

    let format = null;
    let data = null;
    let offset = 12;
    while (offset + 8 <= buffer.length && !(format && data)) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const start = offset + 8;
        if (id === 'fmt ') {
            if (start + 16 > buffer.length) {
                throw new WavFormatError('Truncated WAV format chunk');
            }
            format = {
                audioFormat: buffer.readUInt16LE(start),
                channels: buffer.readUInt16LE(start + 2),
                sampleRate: buffer.readUInt32LE(start + 4),
                byteRate: buffer.readUInt32LE(start + 8),
                blockAlign: buffer.readUInt16LE(start + 12),
                bitsPerSample: buffer.readUInt16LE(start + 14),
            };
        } else if (id === 'data') {
            // A streaming writer may leave the size unset: the rest of the file.
            const end = Math.min(start + size, buffer.length);
            data = buffer.subarray(start, end);
        }
        offset = start + size + (size % 2);
    }

    if (!format || !data) throw new WavFormatError('WAV without fmt or data');
    if (format.audioFormat !== PCM_FORMAT) {
        throw new WavFormatError('WAV is not PCM');
    }
    if (format.channels < 1 || format.blockAlign < 1 || format.byteRate < 1) {
        throw new WavFormatError('WAV format is invalid');
    }

    const usable = data.length - (data.length % format.blockAlign);
    return {
        ...format,
        data: data.subarray(0, usable),
        durationSeconds: usable / format.byteRate,
    };
}

// A canonical 44-byte header followed by the PCM data.
function encodeWav({ channels, sampleRate, bitsPerSample, data }) {
    const blockAlign = (channels * bitsPerSample) / 8;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(PCM_FORMAT, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * blockAlign, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

// Joins parsed clips with `silenceSeconds` of silence between them. Returns the
// WAV, the start of each clip in seconds and the total duration. All clips
// must share one format.
function joinWithSilence(clips, silenceSeconds) {
    if (clips.length === 0) throw new WavFormatError('Nothing to join');
    const first = clips[0];
    for (const clip of clips) {
        if (
            clip.channels !== first.channels ||
            clip.sampleRate !== first.sampleRate ||
            clip.bitsPerSample !== first.bitsPerSample
        ) {
            throw new WavFormatError('Clips have different formats');
        }
    }

    const { blockAlign, byteRate } = first;
    const silenceBytes =
        Math.round((byteRate * silenceSeconds) / blockAlign) * blockAlign;
    const parts = [];
    const starts = [];
    let bytes = 0;
    clips.forEach((clip, index) => {
        if (index > 0) {
            parts.push(Buffer.alloc(silenceBytes));
            bytes += silenceBytes;
        }
        starts.push(bytes / byteRate);
        parts.push(clip.data);
        bytes += clip.data.length;
    });

    const data = Buffer.concat(parts);
    return {
        wav: encodeWav({ ...first, data }),
        starts,
        durationSeconds: data.length / byteRate,
    };
}

module.exports = { WavFormatError, parseWav, encodeWav, joinWithSilence };
