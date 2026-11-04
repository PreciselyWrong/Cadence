package ch.nicolab.cadence.tasks.brief

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Brief du jour, tel que `docs/39-daily-brief.md` le décrit (schéma 1). Les clés inconnues sont ignorées pour qu'une
 * version plus récente du serveur n'empêche pas de lire ce qu'on connaît ; les champs absents prennent leur valeur vide.
 */
@Serializable
data class BriefDto(
    val schema: Int = 1,
    val date: String = "",
    @SerialName("generated_at") val generatedAt: String? = null,
    /** Ordre et visibilité des sections ; absent, l'appareil prend ses réglages (puis l'ordre par défaut). */
    val sections: List<String>? = null,
    val sources: List<SourceDto> = emptyList(),
    val counters: CountersDto = CountersDto(),
    val verdict: VerdictDto = VerdictDto(),
    val timeline: List<TimelineDayDto> = emptyList(),
    val tonight: List<TonightDto> = emptyList(),
    val moves: List<MoveDto> = emptyList(),
    val anticipate: List<AnticipateDto> = emptyList(),
    val replies: List<ReplyDto> = emptyList(),
    val inbox: List<InboxDto> = emptyList(),
    val resolved: List<ResolvedDto> = emptyList(),
    /** Texte écrit pour l'oreille (heures et nombres en lettres, dictionnaire appliqué) : lu par la voix du téléphone. */
    @SerialName("audio_script") val audioScript: AudioScriptDto? = null,
    /** MP3 du serveur, quand il en a rendu un. */
    val audio: AudioDto? = null,
)

@Serializable
data class AudioScriptDto(val chapters: List<ScriptChapterDto> = emptyList())

@Serializable
data class ScriptChapterDto(val id: String = "", val title: String = "", val text: String = "")

@Serializable
data class AudioDto(
    val status: String = "none",
    @SerialName("duration_seconds") val durationSeconds: Double? = null,
    val chapters: List<AudioChapterDto> = emptyList(),
)

@Serializable
data class AudioChapterDto(val id: String = "", @SerialName("start_seconds") val startSeconds: Double = 0.0)

@Serializable
data class SourceDto(val id: String = "", val status: String = "", val detail: String? = null)

@Serializable
data class CountersDto(
    @SerialName("due_today") val dueToday: Int = 0,
    val overdue: Int = 0,
    @SerialName("tonight_minutes") val tonightMinutes: Int = 0,
    @SerialName("capacity_minutes") val capacityMinutes: Int? = null,
    val conflicts: Int = 0,
    val replies: Int = 0,
)

@Serializable
data class VerdictDto(val text: String = "", val by: String = "rules")

@Serializable
data class TimelineDayDto(
    val date: String = "",
    val work: List<WorkDto> = emptyList(),
    val events: List<EventDto> = emptyList(),
    @SerialName("task_uids") val taskUids: List<String> = emptyList(),
    val load: LoadDto = LoadDto(),
    val flags: List<String> = emptyList(),
)

/** Plage de travail d'un jour, en minutes après minuit. */
@Serializable
data class WorkDto(val start: Int = 0, val end: Int = 0, val label: String? = null)

@Serializable
data class EventDto(
    val ref: String = "",
    @SerialName("series_ref") val seriesRef: String? = null,
    val title: String = "",
    @SerialName("all_day") val allDay: Boolean = false,
    @SerialName("start_minute") val startMinute: Int? = null,
    @SerialName("end_minute") val endMinute: Int? = null,
    val calendar: String? = null,
    val conflict: Boolean = false,
)

@Serializable
data class LoadDto(
    @SerialName("planned_minutes") val plannedMinutes: Int = 0,
    @SerialName("capacity_minutes") val capacityMinutes: Int? = null,
    val hypothesis: Boolean = false,
    val note: String? = null,
)

@Serializable
data class TonightDto(
    @SerialName("task_uid") val taskUid: String = "",
    val reason: String = "",
    val minutes: Int? = null,
)

@Serializable
data class MoveDto(
    @SerialName("proposal_key") val proposalKey: String = "",
    @SerialName("task_uid") val taskUid: String = "",
    val from: String = "",
    val to: String = "",
    val reason: String = "",
)

@Serializable
data class AnticipateDto(
    val key: String = "",
    val type: String = "",
    val text: String = "",
    @SerialName("task_uids") val taskUids: List<String> = emptyList(),
    @SerialName("event_refs") val eventRefs: List<String> = emptyList(),
    val question: QuestionDto? = null,
)

@Serializable
data class QuestionDto(val key: String = "", val text: String = "", val target: TargetDto = TargetDto())

@Serializable
data class TargetDto(val scope: String = "", val ref: String = "")

@Serializable
data class ReplyDto(
    val account: String = "",
    @SerialName("thread_ref") val threadRef: String = "",
    val from: String = "",
    val subject: String = "",
    val date: String? = null,
    val summary: String = "",
    val link: String? = null,
)

@Serializable
data class InboxDto(val uid: String = "", val title: String = "", val proposal: InboxProposalDto? = null)

@Serializable
data class InboxProposalDto(val action: String = "", val reason: String = "")

@Serializable
data class ResolvedDto(
    @SerialName("task_uid") val taskUid: String = "",
    @SerialName("completed_at") val completedAt: String? = null,
)

/** Réponse de `GET /daily-plan/:date/brief` : le brief reste en JSON brut pour le cache. */
data class BriefEnvelope(
    /** Le brief tel que reçu, null quand il n'en existe pas pour la date. */
    val briefJson: String?,
    val version: Int,
    val status: String,
    val generatedAt: String?,
)

/** Décodage du JSON du brief et de l'enveloppe, tolérant aux clés inconnues. */
object BriefCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    /** Lit l'enveloppe `{ brief, version, status, generated_at, tasks }` ; `tasks` est ignoré (l'état vient de Room). */
    fun envelope(root: JsonObject): BriefEnvelope {
        val brief = root["brief"]?.takeUnless { it is JsonNull }
        return BriefEnvelope(
            briefJson = brief?.toString(),
            version = root.int("version") ?: 0,
            status = root.string("status") ?: "",
            generatedAt = root.string("generated_at"),
        )
    }

    fun decode(raw: String): BriefDto = json.decodeFromString(BriefDto.serializer(), raw)

    private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.content?.toIntOrNull()

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.content
}
