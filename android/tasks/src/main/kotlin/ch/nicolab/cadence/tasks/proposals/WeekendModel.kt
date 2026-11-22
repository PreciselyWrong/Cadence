package ch.nicolab.cadence.tasks.proposals

import java.time.DayOfWeek
import java.time.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Temps d'un week-end, tel que l'agent le décrit (`docs/48-weekend.md`, « Input »). */
enum class WeekendWeather(val wire: String) {
    SUN("sun"),
    PARTLY("partly"),
    CLOUD("cloud"),
    RAIN("rain"),
    SNOW("snow"),
    STORM("storm"),
    FOG("fog");

    companion object {
        fun of(wire: String?): WeekendWeather? = entries.firstOrNull { it.wire == wire }
    }
}

enum class WeekendPart(val wire: String) {
    MORNING("morning"),
    AFTERNOON("afternoon"),
    DAY("day");

    companion object {
        fun of(wire: String?): WeekendPart? = entries.firstOrNull { it.wire == wire }
    }
}

/** Décisions d'un créneau : `calendar` et `skip` sont finales, `other` demande une autre idée et laisse le créneau ouvert. */
enum class WeekendOp(val wire: String, val final: Boolean) {
    CALENDAR("calendar", final = true),
    SKIP("skip", final = true),
    OTHER("other", final = false);

    companion object {
        fun of(wire: String?): WeekendOp? = entries.firstOrNull { it.wire == wire }
    }
}

/** État de la mise à l'agenda, écrite par capgw côté Hermes (`POST …/events`). */
enum class WeekendEventState(val wire: String) {
    REQUESTED("requested"),
    CREATED("created"),
    FAILED("failed");

    companion object {
        fun of(wire: String?): WeekendEventState? = entries.firstOrNull { it.wire == wire }
    }
}

data class WeekendDay(val date: LocalDate, val weather: WeekendWeather?, val min: Int?, val max: Int?)

data class WeekendActivity(
    val title: String,
    val url: String?,
    val image: String? = null,
    val place: String? = null,
    val note: String?,
    val travel: String?,
    val start: String?,
    val end: String?,
    val after: String?,
)

data class WeekendNearby(
    val title: String,
    val date: LocalDate,
    val start: String?,
    val place: String?,
    val travel: String?,
    val url: String?,
    val image: String?,
    val note: String?,
)

data class WeekendDecision(val op: WeekendOp, val note: String?)

data class WeekendEvent(val state: WeekendEventState?, val link: String?)

data class WeekendSlot(
    val id: String,
    val date: LocalDate,
    val part: WeekendPart,
    val weather: WeekendWeather?,
    val temp: Int?,
    val feels: Int?,
    val busy: String?,
    /** Suite d'un créneau occupé (« Ensuite : balade à Dizy »). */
    val after: String? = null,
    val activity: WeekendActivity?,
    val recommended: Boolean,
    val decision: WeekendDecision?,
    val event: WeekendEvent?,
) {
    /** Un créneau qui attend une décision : une sortie sans décision finale. */
    val isOpen: Boolean get() = activity != null && decision?.op?.final != true
}

data class WeekendElsewhere(
    val place: String,
    val date: LocalDate?,
    val weather: WeekendWeather?,
    val temp: Int?,
    val travel: String?,
)

data class WeekendProposal(
    val uid: String,
    val status: ProposalStatus?,
    val createdAt: String,
    val error: String? = null,
    val requestedDates: List<LocalDate> = emptyList(),
    val headline: String?,
    val subtitle: String?,
    val days: List<WeekendDay>,
    val slots: List<WeekendSlot>,
    val nearby: List<WeekendNearby> = emptyList(),
    val elsewhere: List<WeekendElsewhere>,
)

/** État lu depuis `GET /api/proposals?kind=weekend` : la demande en cours (ou échouée) et le dernier week-end montré. */
data class WeekendState(
    val pending: WeekendProposal? = null,
    val failed: WeekendProposal? = null,
    val shown: WeekendProposal? = null,
)

enum class ShareItemState(val wire: String) {
    CALENDAR("calendar"),
    OPEN("open"),
    BUSY("busy"),
}

data class ShareItem(
    val id: String,
    val part: WeekendPart,
    val title: String,
    val place: String?,
    val start: String?,
    val travel: String?,
    val state: ShareItemState,
)

data class ShareDay(
    val date: LocalDate,
    val weather: WeekendWeather?,
    val min: Int?,
    val max: Int?,
    val items: List<ShareItem>,
)

/** Choix préparés sur les créneaux, avant « Valider » : rien n'est envoyé avant. */
data class WeekendDraft(
    val uid: String? = null,
    val picks: Map<String, WeekendOp> = emptyMap(),
    val notes: Map<String, String> = emptyMap(),
) {
    fun pickOf(slotId: String): WeekendOp? = picks[slotId]

    fun noteOf(slotId: String): String = notes[slotId].orEmpty()

    /** Un créneau ouvert prend le choix ; le même choix une seconde fois le retire. Un créneau fermé ne bouge pas. */
    fun tap(slot: WeekendSlot, op: WeekendOp): WeekendDraft = when {
        !slot.isOpen -> this
        picks[slot.id] == op -> copy(picks = picks - slot.id)
        else -> copy(picks = picks + (slot.id to op))
    }

    /** Remarque rognée à [WeekendModel.NOTE_MAX_LENGTH], sans être rognée d'espaces pendant la saisie ; une remarque vide la retire. */
    fun withNote(slotId: String, text: String): WeekendDraft {
        val capped = text.take(WeekendModel.NOTE_MAX_LENGTH)
        return copy(notes = if (capped.isBlank()) notes - slotId else notes + (slotId to capped))
    }
}

/** Nombre de choix par décision, pour la ligne au-dessus de « Valider ». */
data class WeekendCounts(val calendar: Int, val other: Int, val skip: Int)

/**
 * Règles pures du week-end : lecture de la proposition (`docs/48-weekend.md`), brouillon de départ, corps de
 * `POST …/apply`, décompte. Rien ici ne parle à Android ; l'écran formate les textes.
 */
object WeekendModel {
    /** Longueur maximale d'une remarque envoyée avec une décision. */
    const val NOTE_MAX_LENGTH = 500
    const val MAX_REQUEST_DAYS = 4
    const val PICKER_DAYS = 14
    private const val NEARBY_LIMIT = 12
    private const val TITLE_MAX_LENGTH = 120
    private const val PLACE_MAX_LENGTH = 60

    private val SLOT_ID = Regex("""^[A-Za-z0-9_-]{1,64}$""")

    fun parseList(json: JsonObject): List<WeekendProposal> =
        runCatching { ProposalJson.decodeFromJsonElement(WeekendListDto.serializer(), json).proposals }
            .getOrDefault(emptyList())
            .map(::toProposal)

    fun parseProposal(json: JsonObject): WeekendProposal? =
        runCatching { ProposalJson.decodeFromJsonElement(WeekendProposalDto.serializer(), json) }.getOrNull()?.let(::toProposal)

    /** La plus récente des semaines prêtes ; une en préparation, appliquée ou échouée n'est pas proposée. */
    fun newestReady(proposals: List<WeekendProposal>): WeekendProposal? =
        proposals.filter { it.status == ProposalStatus.READY }.maxByOrNull { it.createdAt }

    /**
     * Choisit dans la liste : la demande en cours (if any), sinon un éventuel échec, plus le dernier week-end montré
     * (`ready` ou `applied`, qui reste décidable pendant qu'une nouvelle demande tourne).
     */
    fun pickState(proposals: List<WeekendProposal>): WeekendState {
        val pending = proposals.filter { it.status == ProposalStatus.PENDING }.maxByOrNull { it.createdAt }
        val shown = proposals
            .filter { it.status == ProposalStatus.READY || it.status == ProposalStatus.APPLIED }
            .maxByOrNull { it.createdAt }
        val failed = if (pending == null) {
            proposals.filter { it.status == ProposalStatus.FAILED }.maxByOrNull { it.createdAt }
        } else {
            null
        }
        return WeekendState(pending = pending, failed = failed, shown = shown)
    }

    /** Jours préselectionnés : le samedi à venir (ou aujourd'hui) et son dimanche ; le dimanche, aujourd'hui seul. */
    fun defaultDays(today: LocalDate): List<LocalDate> {
        if (today.dayOfWeek == DayOfWeek.SUNDAY) return listOf(today)
        val offset = (DayOfWeek.SATURDAY.value - today.dayOfWeek.value + 7) % 7
        val saturday = today.plusDays(offset.toLong())
        return listOf(saturday, saturday.plusDays(1))
    }

    /** Ajoute ou retire [date] (4 jours au plus), résultat trié. */
    fun toggleDay(selected: List<LocalDate>, date: LocalDate): List<LocalDate> = when {
        date in selected -> (selected - date).sorted()
        selected.size >= MAX_REQUEST_DAYS -> selected.sorted()
        else -> (selected + date).sorted()
    }

    /** Les 14 jours à partir de [today]. */
    fun pickerDays(today: LocalDate): List<LocalDate> =
        List(PICKER_DAYS) { today.plusDays(it.toLong()) }

    /** Jours et créneaux à dessiner sur l'image partagée, dans l'ordre de la réponse. */
    fun shareDays(proposal: WeekendProposal, picks: Map<String, WeekendOp>): List<ShareDay> =
        proposal.days.map { day ->
            val items = proposal.slots
                .filter { it.date == day.date }
                .mapNotNull { slot ->
                    when {
                        slot.activity != null -> {
                            val op = picks[slot.id] ?: slot.decision?.op
                            if (op == WeekendOp.SKIP) {
                                null
                            } else {
                                ShareItem(
                                    id = slot.id,
                                    part = slot.part,
                                    title = slot.activity.title,
                                    place = slot.activity.place,
                                    start = slot.activity.start,
                                    travel = slot.activity.travel,
                                    state = if (op == WeekendOp.CALENDAR) ShareItemState.CALENDAR else ShareItemState.OPEN,
                                )
                            }
                        }
                        slot.busy != null -> ShareItem(
                            id = slot.id,
                            part = slot.part,
                            title = slot.busy,
                            place = null,
                            start = null,
                            travel = null,
                            state = ShareItemState.BUSY,
                        )
                        else -> null
                    }
                }
            ShareDay(
                date = day.date,
                weather = day.weather,
                min = day.min,
                max = day.max,
                items = items,
            )
        }

    /** Météo la plus fréquente (null ignoré, égalité = première dans l'ordre des jours, aucune = [WeekendWeather.PARTLY]). */
    fun dominantWeather(days: List<WeekendDay>): WeekendWeather =
        dominantWeatherOf(days.map { it.weather })

    fun dominantWeatherOf(weathers: List<WeekendWeather?>): WeekendWeather {
        val counts = linkedMapOf<WeekendWeather, Int>()
        for (weather in weathers) {
            if (weather != null) {
                counts[weather] = (counts[weather] ?: 0) + 1
            }
        }
        return counts.maxByOrNull { it.value }?.key ?: WeekendWeather.PARTLY
    }

    /** Brouillon de départ : les sorties recommandées encore ouvertes sont préselectionnées. */
    fun startDraft(proposal: WeekendProposal): WeekendDraft = WeekendDraft(
        uid = proposal.uid,
        picks = proposal.slots.filter { it.isOpen && it.recommended }.associate { it.id to WeekendOp.CALENDAR },
    )

    /**
     * Brouillon d'une proposition rechargée : même uid, les choix des créneaux encore ouverts sont gardés ;
     * une autre proposition repart des recommandations.
     */
    fun reconcile(draft: WeekendDraft, proposal: WeekendProposal): WeekendDraft {
        if (draft.uid != proposal.uid) return startDraft(proposal)
        val open = proposal.slots.filter { it.isOpen }.map { it.id }.toSet()
        return draft.copy(picks = draft.picks.filterKeys { it in open }, notes = draft.notes.filterKeys { it in open })
    }

    /** Corps de `POST …/apply` : une décision par choix, la remarque seulement si elle n'est pas vide. */
    fun applyBody(draft: WeekendDraft): JsonObject = buildJsonObject {
        put(
            "decisions",
            buildJsonArray {
                draft.picks.forEach { (slotId, op) ->
                    add(buildJsonObject {
                        put("slot_id", slotId)
                        put("op", op.wire)
                        draft.notes[slotId]?.trim()?.takeIf { it.isNotEmpty() }?.let { put("note", it) }
                    })
                }
            },
        )
    }

    fun countsOf(draft: WeekendDraft): WeekendCounts = WeekendCounts(
        calendar = draft.picks.values.count { it == WeekendOp.CALENDAR },
        other = draft.picks.values.count { it == WeekendOp.OTHER },
        skip = draft.picks.values.count { it == WeekendOp.SKIP },
    )

    fun activityMetaLine(activity: WeekendActivity): String? =
        listOfNotNull(activity.place, activity.start, activity.travel)
            .joinToString(" · ")
            .takeIf { it.isNotEmpty() }

    fun nearbyMetaLine(item: WeekendNearby, dayName: String): String {
        val whenPart = item.start?.let { "$dayName $it" } ?: dayName
        return listOfNotNull(whenPart, item.place, item.travel).joinToString(" · ")
    }

    fun groupNearbyByDay(nearby: List<WeekendNearby>): List<Pair<LocalDate, List<WeekendNearby>>> =
        nearby.groupBy { it.date }.entries.map { (date, items) -> date to items }

    private fun toProposal(dto: WeekendProposalDto): WeekendProposal {
        val answer = dto.answer
        val days = answer?.days.orEmpty().mapNotNull { day ->
            val date = dateOrNull(day.date) ?: return@mapNotNull null
            WeekendDay(date, WeekendWeather.of(day.weather), day.min, day.max)
        }
        val dayDates = days.map { it.date }.toSet()
        return WeekendProposal(
            uid = dto.uid,
            status = ProposalStatus.of(dto.status),
            createdAt = dto.createdAt,
            error = text(dto.error),
            requestedDates = dto.request?.dates.orEmpty().mapNotNull(::dateOrNull),
            headline = text(answer?.headline),
            subtitle = text(answer?.subtitle),
            days = days,
            slots = answer?.slots.orEmpty().mapNotNull(::toSlot),
            nearby = answer?.nearby.orEmpty().mapNotNull { item ->
                val title = text(item.title)?.take(TITLE_MAX_LENGTH) ?: return@mapNotNull null
                val date = dateOrNull(item.date)?.takeIf { it in dayDates } ?: return@mapNotNull null
                WeekendNearby(
                    title = title,
                    date = date,
                    start = text(item.start),
                    place = text(item.place)?.take(PLACE_MAX_LENGTH),
                    travel = text(item.travel),
                    url = safeUrl(item.url),
                    image = safeUrl(item.image),
                    note = text(item.note),
                )
            }.take(NEARBY_LIMIT),
            elsewhere = answer?.elsewhere.orEmpty().mapNotNull { item ->
                text(item.place)?.let { WeekendElsewhere(it, dateOrNull(item.date), WeekendWeather.of(item.weather), item.temp, text(item.travel)) }
            },
        )
    }

    /** Un créneau au mauvais identifiant, jour ou moment n'existe pas ; un lien non https se perd sans le reste. */
    private fun toSlot(dto: WeekendSlotDto): WeekendSlot? {
        if (!SLOT_ID.matches(dto.id)) return null
        val date = dateOrNull(dto.date) ?: return null
        val part = WeekendPart.of(dto.part) ?: return null
        val activity = dto.activity?.let { act ->
            text(act.title)?.let {
                WeekendActivity(
                    title = it,
                    url = safeUrl(act.url),
                    image = safeUrl(act.image),
                    place = text(act.place)?.take(PLACE_MAX_LENGTH),
                    note = text(act.note),
                    travel = text(act.travel),
                    start = text(act.start),
                    end = text(act.end),
                    after = text(act.after),
                )
            }
        }
        return WeekendSlot(
            id = dto.id,
            date = date,
            part = part,
            weather = WeekendWeather.of(dto.weather),
            temp = dto.temp,
            feels = dto.feels,
            busy = text(dto.busy),
            after = text(dto.after),
            activity = activity,
            recommended = dto.recommended,
            decision = dto.decision?.let { d -> WeekendOp.of(d.op)?.let { WeekendDecision(it, text(d.note)) } },
            event = dto.event?.let { WeekendEvent(WeekendEventState.of(it.state), safeUrl(it.link)) },
        )
    }

    private fun safeUrl(raw: String?): String? = text(raw)?.takeIf { it.startsWith("https://", ignoreCase = true) }

    private fun dateOrNull(value: String?): LocalDate? = text(value)?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

    private fun text(raw: String?): String? = raw?.trim()?.takeIf { it.isNotEmpty() }
}

@Serializable
internal data class WeekendListDto(val proposals: List<WeekendProposalDto> = emptyList())

@Serializable
internal data class WeekendProposalDto(
    val uid: String = "",
    val status: String = "",
    val error: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    val request: WeekendRequestDto? = null,
    val answer: WeekendAnswerDto? = null,
)

@Serializable
internal data class WeekendRequestDto(val dates: List<String> = emptyList())

@Serializable
internal data class WeekendAnswerDto(
    val headline: String? = null,
    val subtitle: String? = null,
    val days: List<WeekendDayDto> = emptyList(),
    val slots: List<WeekendSlotDto> = emptyList(),
    val nearby: List<WeekendNearbyDto> = emptyList(),
    val elsewhere: List<WeekendElsewhereDto> = emptyList(),
)

@Serializable
internal data class WeekendDayDto(val date: String? = null, val weather: String? = null, val min: Int? = null, val max: Int? = null)

@Serializable
internal data class WeekendSlotDto(
    val id: String = "",
    val date: String? = null,
    val part: String? = null,
    val weather: String? = null,
    val temp: Int? = null,
    val feels: Int? = null,
    val busy: String? = null,
    val after: String? = null,
    val activity: WeekendActivityDto? = null,
    val recommended: Boolean = false,
    val decision: WeekendDecisionDto? = null,
    val event: WeekendEventDto? = null,
)

@Serializable
internal data class WeekendActivityDto(
    val title: String? = null,
    val url: String? = null,
    val image: String? = null,
    val place: String? = null,
    val note: String? = null,
    val travel: String? = null,
    val start: String? = null,
    val end: String? = null,
    val after: String? = null,
)

@Serializable
internal data class WeekendNearbyDto(
    val title: String? = null,
    val date: String? = null,
    val start: String? = null,
    val place: String? = null,
    val travel: String? = null,
    val url: String? = null,
    val image: String? = null,
    val note: String? = null,
)

@Serializable
internal data class WeekendDecisionDto(val op: String? = null, val note: String? = null)

@Serializable
internal data class WeekendEventDto(val state: String? = null, val link: String? = null)

@Serializable
internal data class WeekendElsewhereDto(
    val place: String? = null,
    val date: String? = null,
    val weather: String? = null,
    val temp: Int? = null,
    val travel: String? = null,
)
