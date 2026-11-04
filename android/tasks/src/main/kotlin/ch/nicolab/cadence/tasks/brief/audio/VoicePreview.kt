package ch.nicolab.cadence.tasks.brief.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/** Joue un extrait synthétisé directement (aucun fichier gardé) ; un nouvel extrait remplace le précédent. */
class VoicePreview {
    private var track: AudioTrack? = null

    fun play(clip: PcmClip) {
        stop()
        val pcm = BriefAudioMath.toPcm16(clip.samples)
        val next = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(clip.sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(pcm.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        next.write(pcm, 0, pcm.size)
        next.play()
        track = next
    }

    fun stop() {
        track?.run {
            runCatching { stop() }
            release()
        }
        track = null
    }
}
