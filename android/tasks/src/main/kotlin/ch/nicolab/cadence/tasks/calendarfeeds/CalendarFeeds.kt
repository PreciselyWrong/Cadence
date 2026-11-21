package ch.nicolab.cadence.tasks.calendarfeeds

import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/** Agenda ICS abonné sur le serveur (`/api/v1/calendar-feeds`). */
data class CalendarFeed(
    val uid: String,
    val name: String,
    val urlHost: String = "",
    val color: String? = null,
    val lastFetchedAt: String? = null,
    val lastError: String? = null,
    val showOnCalendar: Boolean = true,
)

/** Occurrence d'un agenda abonné ou Google renvoyée par `GET /api/v1/calendar-feeds/events`. */
data class FeedEvent(
    val uid: String,
    val title: String,
    val allDay: Boolean,
    val busy: Boolean,
    val date: String,
    val start: String,
    val end: String,
    val startMinute: Int? = null,
    val endMinute: Int? = null,
    val feedUid: String,
    val feedName: String,
    val color: String? = null,
    val source: String? = null,
    val location: String? = null,
    val description: String? = null,
)

/**
 * Client en ligne pour les agendas ICS abonnés et leurs événements.
 * Hors ligne, les appels lèvent une exception réseau.
 */
class CalendarFeedsClient internal constructor(
    private val call: suspend (
        method: String,
        path: String,
        query: Map<String, String>,
        body: JsonObject?,
    ) -> JsonObject,
) {
    suspend fun list(): List<CalendarFeed> =
        parseFeedsList(call("GET", "/api/v1/calendar-feeds", emptyMap(), null))

    suspend fun create(name: String, url: String, color: String? = null): CalendarFeed {
        val fields = buildMap {
            put("name", JsonPrimitive(name.trim()))
            put("url", JsonPrimitive(url.trim()))
            if (!color.isNullOrBlank()) put("color", JsonPrimitive(color.trim()))
        }
        val response = call("POST", "/api/v1/calendar-feeds", emptyMap(), JsonObject(fields))
        val feedObj = response["feed"] as? JsonObject ?: response
        return parseFeed(feedObj) ?: throw IOException("Réponse inattendue du serveur")
    }

    suspend fun setVisible(uid: String, showOnCalendar: Boolean): CalendarFeed {
        val body = JsonObject(mapOf("show_on_calendar" to JsonPrimitive(showOnCalendar)))
        val response = call("PATCH", "/api/v1/calendar-feeds/$uid", emptyMap(), body)
        val feedObj = response["feed"] as? JsonObject ?: response
        return parseFeed(feedObj) ?: throw IOException("Réponse inattendue du serveur")
    }

    suspend fun delete(uid: String) {
        call("DELETE", "/api/v1/calendar-feeds/$uid", emptyMap(), null)
    }

    suspend fun events(start: String, end: String): List<FeedEvent> =
        parseFeedEvents(
            call(
                "GET",
                "/api/v1/calendar-feeds/events",
                mapOf("start" to start, "end" to end),
                null,
            ),
        )

    suspend fun googleShownFeedUids(): Set<String>? {
        val json = call("GET", "/api/v1/google", emptyMap(), null)
        return parseGoogleShownFeedUids(json)
    }

    companion object {
        const val GOOGLE_FEED_PREFIX = "google-"

        fun parseFeedsList(json: JsonObject): List<CalendarFeed> =
            (json["feeds"] as? JsonArray).orEmpty().mapNotNull { element ->
                (element as? JsonObject)?.let(::parseFeed)
            }

        fun parseFeed(json: JsonObject): CalendarFeed? {
            val uid = (json["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val name = (json["name"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val urlHost = (json["url_host"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val color = (json["color"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val lastFetchedAt = (json["last_fetched_at"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val lastError = (json["last_error"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val showOnCalendar = (json["show_on_calendar"] as? JsonPrimitive)?.booleanOrNull ?: true
            return CalendarFeed(
                uid = uid,
                name = name,
                urlHost = urlHost,
                color = color,
                lastFetchedAt = lastFetchedAt,
                lastError = lastError,
                showOnCalendar = showOnCalendar,
            )
        }

        fun parseFeedEvents(json: JsonObject): List<FeedEvent> =
            (json["events"] as? JsonArray).orEmpty().mapNotNull { element ->
                (element as? JsonObject)?.let(::parseFeedEvent)
            }

        fun parseFeedEvent(json: JsonObject): FeedEvent? {
            val uid = (json["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val date = (json["date"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val feedUid = (json["feed_uid"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: return null
            val title = (json["title"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val allDay = (json["all_day"] as? JsonPrimitive)?.booleanOrNull ?: false
            val busy = (json["busy"] as? JsonPrimitive)?.booleanOrNull ?: true
            val start = (json["start"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val end = (json["end"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val startMinute = (json["start_minute"] as? JsonPrimitive)?.intOrNull
            val endMinute = (json["end_minute"] as? JsonPrimitive)?.intOrNull
            val feedName = (json["feed_name"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val color = (json["color"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val source = (json["source"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val location = (json["location"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            val description = (json["description"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            return FeedEvent(
                uid = uid,
                title = title,
                allDay = allDay,
                busy = busy,
                date = date,
                start = start,
                end = end,
                startMinute = startMinute,
                endMinute = endMinute,
                feedUid = feedUid,
                feedName = feedName,
                color = color,
                source = source,
                location = location,
                description = description,
            )
        }

        /** Convertit `#rrggbb` en ARGB opaque, ou rend [fallback]. */
        fun parseHexColor(hex: String?, fallback: Int): Int {
            if (hex.isNullOrBlank()) return fallback
            val clean = hex.trim().removePrefix("#")
            if (clean.length != 6) return fallback
            val rgb = clean.toIntOrNull(16) ?: return fallback
            return (0xFF shl 24) or rgb
        }

        /**
         * Filtre les événements selon les agendas visibles (ICS et Google connecté).
         * Les agendas Google (`google-...`) suivent `show_on_calendar` quand [googleShown] est connu.
         */
        fun visibleEvents(
            events: List<FeedEvent>,
            feeds: List<CalendarFeed>?,
            googleShown: Set<String>?,
        ): List<FeedEvent> {
            val shownIcs = feeds?.filter { it.showOnCalendar }?.map { it.uid }?.toSet()
            return events.filter { event ->
                if (event.feedUid.startsWith(GOOGLE_FEED_PREFIX)) {
                    googleShown == null || event.feedUid in googleShown
                } else {
                    shownIcs == null || event.feedUid in shownIcs
                }
            }
        }

        fun parseGoogleShownFeedUids(json: JsonObject): Set<String>? {
            val connected = (json["connected"] as? JsonPrimitive)?.booleanOrNull == true
            val syncEvents = (json["sync_events"] as? JsonPrimitive)?.booleanOrNull ?: true
            if (!connected || !syncEvents) return emptySet()
            val calendars = json["calendars"] as? JsonArray ?: return null
            return calendars.mapNotNull { element ->
                val obj = element as? JsonObject ?: return@mapNotNull null
                val isTududi = (obj["is_tududi"] as? JsonPrimitive)?.booleanOrNull == true
                val syncMode = (obj["sync_mode"] as? JsonPrimitive)?.contentOrNull
                val showOnCalendar = (obj["show_on_calendar"] as? JsonPrimitive)?.booleanOrNull ?: true
                val feedUid = (obj["feed_uid"] as? JsonPrimitive)?.contentOrNull
                    ?: (obj["uid"] as? JsonPrimitive)?.contentOrNull?.let { "$GOOGLE_FEED_PREFIX$it" }
                if (!isTududi && syncMode != "hidden" && showOnCalendar && !feedUid.isNullOrBlank()) feedUid else null
            }.toSet()
        }
    }
}

/**
 * Dépôt en mémoire pour la session : partage la liste des agendas abonnés entre Réglages et
 * l'onglet Agenda, et garde les derniers événements lus pour supporter une coupure réseau courte.
 */
class CalendarFeedsRepository internal constructor(
    private val client: CalendarFeedsClient,
) {
    private val _feeds = MutableStateFlow<List<CalendarFeed>?>(null)
    val feeds: StateFlow<List<CalendarFeed>?> = _feeds.asStateFlow()

    private val _googleShown = MutableStateFlow<Set<String>?>(null)
    val googleShown: StateFlow<Set<String>?> = _googleShown.asStateFlow()

    private val rangeCache = LinkedHashMap<Pair<String, String>, List<FeedEvent>>()

    suspend fun refreshFeeds(): Result<List<CalendarFeed>> = attempt {
        val loaded = client.list()
        _feeds.value = loaded
        loaded
    }

    suspend fun refreshGoogleStatus() {
        attempt { client.googleShownFeedUids() }.onSuccess { shown ->
            _googleShown.value = shown
        }
    }

    suspend fun createFeed(name: String, url: String, color: String? = null): Result<CalendarFeed> = attempt {
        val created = client.create(name, url, color)
        _feeds.value = _feeds.value.orEmpty() + created
        synchronized(rangeCache) { rangeCache.clear() }
        created
    }

    suspend fun toggleFeed(uid: String, showOnCalendar: Boolean): Result<CalendarFeed> {
        val previous = _feeds.value
        _feeds.value = previous?.map { if (it.uid == uid) it.copy(showOnCalendar = showOnCalendar) else it }
        val result = attempt { client.setVisible(uid, showOnCalendar) }
        result.onSuccess { updated ->
            _feeds.value = _feeds.value?.map { if (it.uid == uid) updated else it }
        }.onFailure {
            _feeds.value = previous
        }
        return result
    }

    suspend fun deleteFeed(uid: String): Result<Unit> = attempt {
        client.delete(uid)
        _feeds.value = _feeds.value?.filterNot { it.uid == uid }
        synchronized(rangeCache) { rangeCache.clear() }
    }

    /**
     * Charge les événements pour `[start, end]` (`YYYY-MM-DD`). En cas d'échec réseau, rend le dernier
     * résultat en cache pour cette plage (ou les événements déjà en cache qui tombent dans la plage).
     */
    suspend fun eventsForRange(start: String, end: String): List<FeedEvent> {
        return try {
            val loaded = client.events(start, end)
            synchronized(rangeCache) {
                rangeCache[start to end] = loaded
            }
            loaded
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            synchronized(rangeCache) {
                rangeCache[start to end]
                    ?: rangeCache.values.flatten()
                        .filter { it.date in start..end }
                        .distinctBy { Triple(it.feedUid, it.uid, "${it.date}:${it.startMinute}") }
            }
        }
    }

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (t: Throwable) {
        Result.failure(t)
    }
}
