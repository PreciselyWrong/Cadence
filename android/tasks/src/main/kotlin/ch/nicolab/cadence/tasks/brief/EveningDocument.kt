package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.brief.audio.AudioTarget
import ch.nicolab.cadence.tasks.brief.audio.BriefAudioFiles
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Bilan du soir, tel que `docs/39-daily-brief.md` (« Evening review », schéma 1) le décrit : calculé par le serveur à
 * chaque lecture, jamais gardé là-bas. Mêmes règles de lecture que [BriefDto] : clés inconnues ignorées, champs absents vides.
 */
@Serializable
data class EveningDto(
    val schema: Int = 1,
    val date: String = "",
    @SerialName("generated_at") val generatedAt: String? = null,
    val verdict: VerdictDto = VerdictDto(),
    val counters: EveningCountersDto = EveningCountersDto(),
    /** Tâches terminées aujourd'hui, la plus récente d'abord. */
    val done: List<String> = emptyList(),
    /** Les tâches « ce soir » du résumé du matin encore ouvertes, dans l'ordre. */
    val tonight: List<TonightDto> = emptyList(),
    /** Prévues aujourd'hui, encore ouvertes, hors « ce soir ». */
    val slipped: List<SlippedDto> = emptyList(),
    /** Ce que le bilan propose de reporter à demain : les glissées et le « ce soir » restant. */
    @SerialName("carry_over") val carryOver: List<String> = emptyList(),
    val tomorrow: TimelineDayDto? = null,
    @SerialName("audio_script") val audioScript: AudioScriptDto? = null,
)

@Serializable
data class EveningCountersDto(
    val done: Int = 0,
    val slipped: Int = 0,
    @SerialName("tonight_minutes") val tonightMinutes: Int = 0,
    @SerialName("capacity_minutes") val capacityMinutes: Int? = null,
)

@Serializable
data class SlippedDto(
    @SerialName("task_uid") val taskUid: String = "",
    val reason: String = "",
    @SerialName("reason_code") val reasonCode: String? = null,
)

/** Réponse de `GET /daily-plan/:date/evening` : le bilan reste en JSON brut pour le cache. */
data class EveningEnvelope(val date: String, val eveningJson: String?)

object EveningCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    /** Lit `{ date, evening, tasks }` ; `tasks` est ignoré (l'état des tâches vient de Room). */
    fun envelope(root: JsonObject): EveningEnvelope = EveningEnvelope(
        date = (root["date"] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.content.orEmpty(),
        eveningJson = root["evening"]?.takeUnless { it is JsonNull }?.toString(),
    )

    fun decode(raw: String): EveningDto = json.decodeFromString(EveningDto.serializer(), raw)
}

/** Bilan d'une date, tel que lu la dernière fois ; [evening] est null si le JSON gardé ne se lit plus. */
data class CachedEvening(val date: java.time.LocalDate, val evening: EveningDto?, val fetchedAtMs: Long) {
    /**
     * Ce que la voix lit : le script du bilan. Pas de MP3 serveur ; la version du fichier vient du texte, pour qu'un
     * bilan inchangé garde son rendu et qu'un bilan modifié en refasse un.
     */
    fun audioTarget(): AudioTarget? {
        val dto = evening ?: return null
        val script = dto.audioScript ?: return null
        val text = script.chapters.joinToString("\n") { it.id + "|" + it.text }
        return AudioTarget(date, BriefAudioFiles.eveningVersion(text), script)
    }
}
