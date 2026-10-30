package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.model.TaskPriority
import java.text.Normalizer
import java.time.Clock
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

/** Projet ou étiquette existants, désignés dans le texte par leur nom. */
data class NamedRef(val uid: String, val name: String)

enum class TokenKind { DATE, TIME, PRIORITY, PROJECT, TAG }

/**
 * Un mot reconnu dans le texte. [key] ne dépend pas de la position : ignorer « demain » l'ignore
 * partout. [refUid] est l'uid du projet ou de l'étiquette désignés.
 */
data class ParsedToken(
    val kind: TokenKind,
    val start: Int,
    val end: Int,
    val text: String,
    val key: String,
    val refUid: String? = null,
)

/** Résultat de l'analyse : le titre sans les mots reconnus, et ce qui en a été tiré. */
data class ParsedQuickAdd(
    val title: String,
    val date: LocalDate?,
    val time: LocalTime?,
    val priority: Int?,
    val projectUid: String?,
    val tagUids: List<String>,
    val tokens: List<ParsedToken>,
)

/**
 * Analyse d'une saisie rapide en français : dates (aujourd'hui, demain, après-demain, jours de la
 * semaine, « lundi prochain », « dans 3 jours », « ce soir », « ce week-end », « semaine
 * prochaine »), heures (« à 14h », « 14h30 », « 14:30 », « midi »), `+projet` / `^projet` /
 * `#nom`, `@étiquette` et `!1`-`!3`. Les jetons `#`, `+`, `^` et `!` sont ceux de la capture
 * web (`frontend/utils/inboxTokens.ts`) ; `#nom` désigne une étiquette, ou à défaut un projet
 * existant, `@nom` une étiquette. Un mot qui ne désigne rien d'existant reste dans le titre.
 * Les accents et la casse sont ignorés.
 */
object QuickAddParser {
    private const val EVENING_HOUR = 19
    private const val NOON = 12
    private const val MAX_HOUR = 23
    private const val MAX_MINUTE = 59
    private const val MIN_FUZZY_LENGTH = 2

    private val BOUND_BEFORE = "(?<![\\p{L}\\p{N}_])"
    private val BOUND_AFTER = "(?![\\p{L}\\p{N}_])"
    private const val LEAD = "(?:pour\\s+)?(?:le\\s+|ce\\s+)?"

    private val weekdays = mapOf(
        "lundi" to DayOfWeek.MONDAY,
        "mardi" to DayOfWeek.TUESDAY,
        "mercredi" to DayOfWeek.WEDNESDAY,
        "jeudi" to DayOfWeek.THURSDAY,
        "vendredi" to DayOfWeek.FRIDAY,
        "samedi" to DayOfWeek.SATURDAY,
        "dimanche" to DayOfWeek.SUNDAY,
    )
    private val dayAlternatives = weekdays.keys.joinToString("|")

    private val numberWords = mapOf(
        "un" to 1, "une" to 1, "deux" to 2, "trois" to 3, "quatre" to 4, "cinq" to 5,
        "six" to 6, "sept" to 7, "huit" to 8, "neuf" to 9, "dix" to 10,
    )

    private class DateHit(val date: LocalDate, val impliedTime: LocalTime? = null)

    private class Candidate(
        val order: Int,
        val start: Int,
        val end: Int,
        val date: DateHit? = null,
        val time: LocalTime? = null,
    )

    private class DatePattern(val regex: Regex, val resolve: (MatchResult, LocalDate) -> DateHit?)

    private fun rx(body: String) = Regex(BOUND_BEFORE + body + BOUND_AFTER)

    private val datePatterns: List<DatePattern> = listOf(
        DatePattern(rx("(?:pour\\s+)?apres[- ]demain")) { _, today -> DateHit(today.plusDays(2)) },
        DatePattern(rx("(?:pour\\s+)?(?:la\\s+)?semaine\\s+prochaine")) { _, today -> DateHit(QuickDates.nextWeek(today)) },
        DatePattern(rx("(?:pour\\s+)?(?:ce\\s+|le\\s+)?week[- ]?end")) { _, today -> DateHit(QuickDates.weekend(today)) },
        DatePattern(rx("ce\\s+soir")) { _, today -> DateHit(today, LocalTime.of(EVENING_HOUR, 0)) },
        DatePattern(rx("dans\\s+(\\d{1,3}|${numberWords.keys.joinToString("|")})\\s+(jours?|semaines?|mois)")) { match, today ->
            val amount = match.groupValues[1].toIntOrNull() ?: numberWords[match.groupValues[1]] ?: return@DatePattern null
            val unit = match.groupValues[2]
            val date = when {
                unit.startsWith("jour") -> today.plusDays(amount.toLong())
                unit.startsWith("semaine") -> today.plusWeeks(amount.toLong())
                else -> today.plusMonths(amount.toLong())
            }
            DateHit(date)
        },
        DatePattern(rx("$LEAD($dayAlternatives)\\s+prochain")) { match, today ->
            weekdays[match.groupValues[1]]?.let { DateHit(QuickDates.inNextWeek(today, it)) }
        },
        DatePattern(rx("$LEAD($dayAlternatives)")) { match, today ->
            weekdays[match.groupValues[1]]?.let { DateHit(QuickDates.nextOccurrence(today, it)) }
        },
        DatePattern(rx("(?:pour\\s+)?demain")) { _, today -> DateHit(QuickDates.tomorrow(today)) },
        DatePattern(rx("(?:pour\\s+)?aujourd['\\s]?hui")) { _, today -> DateHit(today) },
    )

    private val clockTime = Regex("(?<![\\p{L}\\p{N}_:])(?:a\\s+)?(\\d{1,2})\\s?(?:heures?|h)(\\d{2})?$BOUND_AFTER")
    private val colonTime = Regex("(?<![\\p{L}\\p{N}_:])(?:a\\s+)?(\\d{1,2}):(\\d{2})$BOUND_AFTER")
    private val noon = Regex("(?<![\\p{L}\\p{N}_])(?:a\\s+)?midi$BOUND_AFTER")
    private val priorityToken = Regex("(?<!\\S)!([123])(?!\\S)")
    private val markedToken = Regex("(?<!\\S)([#+@^])(?:\"([^\"]+)\"|([\\p{L}\\p{N}_-]+))")
    private val spaces = Regex("\\s+")

    fun parse(
        text: String,
        clock: Clock,
        projects: List<NamedRef>,
        tags: List<NamedRef>,
        ignored: Set<String> = emptySet(),
    ): ParsedQuickAdd {
        val today = LocalDate.now(clock)
        val folded = fold(text)
        val tokens = mutableListOf<ParsedToken>()
        val taken = mutableListOf<IntRange>()

        fun free(start: Int, end: Int) = taken.none { start < it.last + 1 && it.first < end }
        fun claim(kind: TokenKind, start: Int, end: Int, refUid: String? = null): Boolean {
            val key = kind.name + ":" + folded.substring(start, end).replace(spaces, " ")
            if (key in ignored || !free(start, end)) return false
            taken += start until end
            tokens += ParsedToken(kind, start, end, text.substring(start, end), key, refUid)
            return true
        }

        // Dates et heures : les motifs plus précis passent avant, puis le premier mot du texte l'emporte.
        val dateHit = datePatterns.withIndex()
            .flatMap { (order, pattern) ->
                pattern.regex.findAll(folded).mapNotNull { match ->
                    pattern.resolve(match, today)?.let { Candidate(order, match.range.first, match.range.last + 1, date = it) }
                }.toList()
            }
            .let { accept(it) }
            .minByOrNull { it.start }
            ?.takeIf { claim(TokenKind.DATE, it.start, it.end) }
            ?.date

        val explicitTime = timeCandidates(folded).minByOrNull { it.start }
            ?.takeIf { claim(TokenKind.TIME, it.start, it.end) }
            ?.time

        val priority = priorityToken.findAll(folded)
            .firstOrNull { claim(TokenKind.PRIORITY, it.range.first, it.range.last + 1) }
            ?.let { priorityOf(it.groupValues[1]) }

        var projectUid: String? = null
        val tagUids = mutableListOf<String>()
        for (match in markedToken.findAll(folded)) {
            val start = match.range.first
            val end = match.range.last + 1
            val query = normalise(match.groupValues[2].ifEmpty { match.groupValues[3] })
            when (match.groupValues[1]) {
                "+", "^" -> if (projectUid == null) {
                    findUnique(projects, query)?.let { if (claim(TokenKind.PROJECT, start, end, it.uid)) projectUid = it.uid }
                }
                "#" -> {
                    val exactTag = tags.firstOrNull { normalise(it.name) == query }
                    val project = if (exactTag == null && projectUid == null) findUnique(projects, query) else null
                    val tag = exactTag ?: if (project == null) findUnique(tags, query) else null
                    if (tag != null) {
                        if (tag.uid !in tagUids && claim(TokenKind.TAG, start, end, tag.uid)) tagUids += tag.uid
                    } else if (project != null && claim(TokenKind.PROJECT, start, end, project.uid)) {
                        projectUid = project.uid
                    }
                }
                "@" -> findUnique(tags, query)?.let {
                    if (it.uid !in tagUids && claim(TokenKind.TAG, start, end, it.uid)) tagUids += it.uid
                }
            }
        }

        val impliedTime = dateHit?.impliedTime
        val time = explicitTime ?: impliedTime
        val resolvedDate = dateHit?.date ?: today.takeIf { time != null }

        return ParsedQuickAdd(
            title = cleanTitle(text, tokens),
            date = resolvedDate,
            time = time.takeIf { resolvedDate != null },
            priority = priority,
            projectUid = projectUid,
            tagUids = tagUids,
            tokens = tokens.sortedBy { it.start },
        )
    }

    /** Résout les chevauchements : le motif d'ordre le plus bas garde sa place. */
    private fun accept(candidates: List<Candidate>): List<Candidate> {
        val accepted = mutableListOf<Candidate>()
        candidates.sortedWith(compareBy({ it.order }, { it.start })).forEach { candidate ->
            if (accepted.none { candidate.start < it.end && it.start < candidate.end }) accepted += candidate
        }
        return accepted
    }

    private fun timeCandidates(folded: String): List<Candidate> {
        val found = mutableListOf<Candidate>()
        clockTime.findAll(folded).forEach { match ->
            val minutes = match.groupValues[2].ifEmpty { "0" }.toInt()
            timeOf(match.groupValues[1].toInt(), minutes)?.let { found += Candidate(0, match.range.first, match.range.last + 1, time = it) }
        }
        colonTime.findAll(folded).forEach { match ->
            timeOf(match.groupValues[1].toInt(), match.groupValues[2].toInt())
                ?.let { found += Candidate(1, match.range.first, match.range.last + 1, time = it) }
        }
        noon.findAll(folded).forEach { match ->
            found += Candidate(2, match.range.first, match.range.last + 1, time = LocalTime.of(NOON, 0))
        }
        return accept(found)
    }

    private fun timeOf(hour: Int, minute: Int): LocalTime? =
        if (hour in 0..MAX_HOUR && minute in 0..MAX_MINUTE) LocalTime.of(hour, minute) else null

    private fun priorityOf(digit: String): Int = when (digit) {
        "1" -> TaskPriority.HIGH
        "2" -> TaskPriority.MEDIUM
        else -> TaskPriority.LOW
    }

    /** Nom exact, sinon seul nom commençant par la requête, sinon seul nom qui la contient. */
    private fun findUnique(refs: List<NamedRef>, query: String): NamedRef? {
        if (query.isEmpty()) return null
        refs.firstOrNull { normalise(it.name) == query }?.let { return it }
        if (query.length < MIN_FUZZY_LENGTH) return null
        val prefixed = refs.filter { normalise(it.name).startsWith(query) }
        if (prefixed.isNotEmpty()) return prefixed.singleOrNull()
        return refs.filter { query in normalise(it.name) }.singleOrNull()
    }

    private fun cleanTitle(text: String, tokens: List<ParsedToken>): String {
        val kept = StringBuilder()
        var cursor = 0
        tokens.sortedBy { it.start }.forEach { token ->
            kept.append(text, cursor, token.start).append(' ')
            cursor = token.end
        }
        kept.append(text, cursor, text.length)
        return kept.toString().replace(spaces, " ").trim().trimEnd(',', ';', ':', '-', '–').trim()
    }

    private fun normalise(value: String): String =
        fold(value).replace('_', ' ').replace('-', ' ').replace(spaces, " ").trim()

    /** Minuscules sans accents, une lettre pour une lettre : les positions restent celles du texte saisi. */
    private fun fold(value: String): String = buildString(value.length) {
        for (char in value) {
            val base = Normalizer.normalize(char.toString(), Normalizer.Form.NFD)[0]
            append(
                when (base) {
                    '’', '‘', 'ʼ', '`' -> '\''
                    else -> base.lowercaseChar()
                },
            )
        }
    }
}
