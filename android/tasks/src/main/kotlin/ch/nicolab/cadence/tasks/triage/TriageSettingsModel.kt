package ch.nicolab.cadence.tasks.triage

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

data class TriageCalendarOption(
    val uid: String,
    val name: String,
)

data class TriageSettingsData(
    val calendarFeedUids: List<String> = emptyList(),
    val calendarLookaheadDays: Int = 7,
    val postponements: Int = 3,
    val duplicateSimilarity: Double = 0.8,
    val closedLookbackDays: Int = 7,
    val disabledAlerts: Set<String> = emptySet(),
    val aiEnabled: Boolean = false,
    val aiDailyLimit: Int = 20,
)

object TriageSettingsCodec {
    val ALERT_TYPES = listOf(
        "conflict",
        "event_in_work_hours",
        "duplicate",
        "deadline_in_note",
        "postponed",
    )

    fun parse(body: JsonObject): TriageSettingsData {
        val thresholds = body["thresholds"] as? JsonObject
        val alerts = body["alerts"] as? JsonObject
        val triage = body["triage"] as? JsonObject
        return TriageSettingsData(
            calendarFeedUids = stringList(body["calendarFeedUids"]),
            calendarLookaheadDays = ((body["calendarLookaheadDays"] as? JsonPrimitive)?.intOrNull ?: 7).coerceIn(1, 14),
            postponements = ((thresholds?.get("postponements") as? JsonPrimitive)?.intOrNull ?: 3).coerceIn(1, 20),
            duplicateSimilarity = ((thresholds?.get("duplicateSimilarity") as? JsonPrimitive)?.doubleOrNull ?: 0.8).coerceIn(0.0, 1.0),
            closedLookbackDays = ((thresholds?.get("closedLookbackDays") as? JsonPrimitive)?.intOrNull ?: 7).coerceIn(1, 60),
            disabledAlerts = stringList(alerts?.get("disabled")).filter { it in ALERT_TYPES }.toSet(),
            aiEnabled = (triage?.get("enabled") as? JsonPrimitive)?.booleanOrNull == true,
            aiDailyLimit = ((triage?.get("dailyLimit") as? JsonPrimitive)?.intOrNull ?: 20).coerceIn(1, 200),
        )
    }

    fun toPutBody(data: TriageSettingsData): JsonObject = buildJsonObject {
        putJsonArray("calendarFeedUids") {
            data.calendarFeedUids.distinct().forEach { add(JsonPrimitive(it)) }
        }
        put("calendarLookaheadDays", data.calendarLookaheadDays.coerceIn(1, 14))
        putJsonObject("thresholds") {
            put("postponements", data.postponements.coerceIn(1, 20))
            put("duplicateSimilarity", data.duplicateSimilarity.coerceIn(0.0, 1.0))
            put("closedLookbackDays", data.closedLookbackDays.coerceIn(1, 60))
        }
        putJsonObject("alerts") {
            putJsonArray("disabled") {
                data.disabledAlerts.filter { it in ALERT_TYPES }.forEach { add(JsonPrimitive(it)) }
            }
        }
        putJsonObject("triage") {
            put("enabled", data.aiEnabled)
            put("dailyLimit", data.aiDailyLimit.coerceIn(1, 200))
        }
    }

    fun parseCalendarFeeds(body: JsonObject): List<TriageCalendarOption> {
        val feeds = body["feeds"] as? JsonArray ?: return emptyList()
        return feeds.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val uid = (obj["uid"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val name = (obj["name"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) ?: uid
            TriageCalendarOption(uid, name)
        }
    }

    fun parseGoogleCalendars(body: JsonObject): List<TriageCalendarOption> {
        val calendars = body["calendars"] as? JsonArray ?: return emptyList()
        return calendars.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val uid = (obj["feed_uid"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val name = (obj["name"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) ?: uid
            TriageCalendarOption(uid, name)
        }
    }

    private fun stringList(element: kotlinx.serialization.json.JsonElement?): List<String> {
        val array = element as? JsonArray ?: return emptyList()
        return array.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) }
    }
}
