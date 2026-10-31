package ch.nicolab.cadence.data.sync

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Genre d'une colonne Room, qui fixe sa forme sur le fil : texte, entier, booléen (0/1) ou instant (époque en ms). */
enum class ColumnKind { TEXT, NUMBER, BOOLEAN, INSTANT }

/**
 * Un champ synchronisé : son nom sur le fil (snake_case, `docs/21-habits.md`) et la colonne Room qui le porte.
 *
 * @param whenNull valeur à ranger quand le serveur envoie null pour une colonne qui ne peut pas l'être.
 * @param group les champs d'un même groupe partent dans la même opération : le serveur fusionne champ par
 *   champ, donc un groupe écrit à moitié mélangerait deux appareils (chronomètre, progression).
 */
class FieldSpec(
    val wire: String,
    val column: String,
    val kind: ColumnKind,
    val whenNull: ((JsonObject) -> Any?)? = null,
    val group: String? = null,
)

/**
 * Une entité synchronisée et sa table Room. Les valeurs de colonne circulent en `Map<String, Any?>` :
 * `String`, `Long` (booléens 0/1, instants en ms) ou null.
 *
 * @param uidSql expression SQL du uid, colonnes préfixées par `NEW`/`OLD` dans les déclencheurs.
 * @param locate colonnes qui désignent la ligne à partir de son uid (clé primaire ou index unique).
 * @param naturalKey colonnes de la clé naturelle : un seul uid par valeur chez un même compte.
 */
class EntitySpec(
    val entity: String,
    val table: String,
    val uidSql: (prefix: String) -> String,
    val locate: (uid: String) -> Map<String, Any>,
    val fields: List<FieldSpec>,
    val naturalKey: List<String> = emptyList(),
) {
    val byWire: Map<String, FieldSpec> = fields.associateBy { it.wire }
    val byColumn: Map<String, FieldSpec> = fields.associateBy { it.column }

    /** Champs à envoyer ensemble avec [wire] : lui-même, ou tout son groupe atomique. */
    fun withGroupmates(wire: String): List<FieldSpec> {
        val field = byWire.getValue(wire)
        val group = field.group ?: return listOf(field)
        return fields.filter { it.group == group }
    }
}

private fun id(column: String = "id"): (String) -> Map<String, Any> = { uid -> mapOf(column to uid) }

private fun same(column: String): (String) -> String = { prefix -> "$prefix.$column" }

private fun text(
    wire: String,
    column: String = camel(wire),
    group: String? = null,
    whenNull: ((JsonObject) -> Any?)? = null,
) = FieldSpec(wire, column, ColumnKind.TEXT, whenNull, group)

private fun number(wire: String, column: String = camel(wire), group: String? = null) =
    FieldSpec(wire, column, ColumnKind.NUMBER, group = group)

private fun flag(wire: String, column: String = camel(wire)) = FieldSpec(wire, column, ColumnKind.BOOLEAN)

private fun instant(wire: String, column: String, whenNull: ((JsonObject) -> Any?)? = null, group: String? = null) =
    FieldSpec(wire, column, ColumnKind.INSTANT, whenNull, group)

/** `local_date` devient `localDate` : le nom Room d'une colonne se déduit du nom sur le fil. */
internal fun camel(wire: String): String =
    wire.split('_').mapIndexed { index, part -> if (index == 0) part else part.replaceFirstChar(Char::uppercase) }
        .joinToString("")

/** Date de création serveur, quand une habitude arrive sans `client_created_at`. */
private val createdAtFallback: (JsonObject) -> Any? = { data ->
    data["created_at"]?.jsonPrimitive?.contentOrNull?.let(WireValues::parseInstantMs) ?: 0L
}

/** Spécification des entités d'habitudes, dans l'ordre d'envoi : un parent avant ses enfants. */
object HabitSyncSpecs {
    const val DELETE_MARK = "*delete"

    /** Groupe de repli d'une habitude : celui que le serveur appelle null. */
    const val ALL_DAY_GROUP = "group-day"

    /** `_` puis `YYYY-MM-DD` : la fin du uid d'une réponse apprise est la date. */
    private const val DATE_SUFFIX = 11

    private fun habitRef() = text("habit_uid", "habitId")

    val all: List<EntitySpec> = listOf(
        EntitySpec(
            "habit_group", "habit_groups", same("id"), id(),
            listOf(
                text("name"),
                number("start_minute", "startMinute"),
                number("end_minute", "endMinute"),
                number("sort_order", "sortOrder"),
            ),
        ),
        EntitySpec(
            "habit", "habits", same("id"), id(),
            listOf(
                text("group_uid", "groupId", whenNull = { ALL_DAY_GROUP }),
                text("name"),
                text("description"),
                text("icon_id", "iconId"),
                number("color_argb", "colorArgb"),
                flag("active"),
                text("starts_on", "startsOn"),
                flag("archived"),
                number("sort_order", "sortOrder"),
                instant("client_created_at", "createdAtEpochMs", whenNull = createdAtFallback),
                flag("timer_enabled", "timerEnabled"),
                text("abstinence_profile", "abstinenceProfile"),
                instant("abstinence_started_at", "abstinenceStartedAtEpochMs"),
                number("abstinence_spending_minor", "abstinenceSpendingMinor"),
                text("abstinence_spending_period", "abstinenceSpendingPeriod"),
                text("abstinence_savings_currency", "abstinenceSavingsCurrency"),
                text("alcohol_follow_up_time", "alcoholFollowUpTime"),
            ),
        ),
        EntitySpec(
            "habit_goal", "habit_goals", same("id"), id(),
            listOf(
                habitRef(),
                number("target_minor", "targetMinor"),
                text("period"),
                text("goal_type", "goalType"),
                text("unit_id", "unitId"),
                text("unit_dimension", "unitDimension"),
                text("unit_name_fr", "unitNameFr"),
                text("unit_symbol", "unitSymbol"),
                number("unit_scale_to_canonical", "unitScaleToCanonical"),
                number("frequency_target", "frequencyTarget"),
                number("minimum_minor", "minimumMinor"),
                text("direction"),
                number("progression_step", "progressionStep", group = "progression"),
                text("progression_cadence", "progressionCadence", group = "progression"),
                number("progression_cap_minor", "progressionCapMinor", group = "progression"),
                text("progression_starts_on", "progressionStartsOn", group = "progression"),
                text("effective_from", "effectiveFrom"),
            ),
        ),
        EntitySpec(
            "habit_schedule", "habit_schedules", same("id"), id(),
            listOf(
                habitRef(),
                text("schedule_mode", "scheduleMode"),
                text("active_days", "activeDays"),
                text("first_day_of_week", "firstDayOfWeek"),
                text("effective_from", "effectiveFrom"),
                number("interval_days", "intervalDays"),
            ),
        ),
        EntitySpec(
            "habit_entry", "habit_entries", same("id"), id(),
            listOf(
                habitRef(),
                instant("occurred_at", "occurredAtEpochMs"),
                text("local_date", "localDate"),
                text("observed_zone_id", "observedZoneId"),
                number("value_minor", "valueMinor"),
                text("source"),
                text("session_id", "sessionId"),
                text("note"),
            ),
        ),
        EntitySpec(
            "habit_pause", "habit_pauses", same("id"), id(),
            listOf(
                habitRef(),
                text("start"),
                text("end_exclusive", "endExclusive"),
                text("reason"),
                text("reason_label", "reasonLabel"),
            ),
        ),
        EntitySpec(
            "habit_quick_value", "habit_quick_values", same("id"), id(),
            listOf(
                habitRef(),
                text("label"),
                number("amount_minor", "amountMinor"),
                number("sort_order", "sortOrder"),
            ),
        ),
        EntitySpec(
            "habit_reminder", "habit_reminders", same("id"), id(),
            listOf(
                habitRef(),
                text("time"),
                text("days_of_week", "daysOfWeek"),
                flag("enabled"),
                flag("conditional"),
            ),
        ),
        EntitySpec(
            "habit_timer", "habit_timers", same("habitId"), id("habitId"),
            listOf(
                habitRef(),
                number("accumulated_seconds", "accumulatedSeconds", group = "timer"),
                instant("running_since", "runningSinceEpochMs", group = "timer"),
            ),
            naturalKey = listOf("habitId"),
        ),
        EntitySpec(
            "health_connect_rule", "health_connect_rules", same("habitId"), id("habitId"),
            listOf(
                habitRef(),
                text("exercise_types", "exerciseTypes"),
                text("data_origin_package", "dataOriginPackage"),
                flag("enabled"),
            ),
            naturalKey = listOf("habitId"),
        ),
        EntitySpec(
            "health_connect_import", "health_connect_imports", same("entryId"), id("entryId"),
            listOf(
                habitRef(),
                text("record_id", "recordId"),
                text("entry_uid", "entryId"),
                text("data_origin_package", "dataOriginPackage"),
                text("state"),
            ),
            naturalKey = listOf("habitId", "recordId"),
        ),
        EntitySpec(
            "abstinence_log", "abstinence_logs", same("id"), id(),
            listOf(
                habitRef(),
                instant("occurred_at", "occurredAtEpochMs"),
                text("local_date", "localDate"),
                text("observed_zone_id", "observedZoneId"),
                text("kind"),
                number("intensity"),
                text("note"),
            ),
        ),
        EntitySpec(
            "alcohol_consumption", "alcohol_consumptions", same("id"), id(),
            listOf(
                habitRef(),
                text("local_date", "localDate"),
                text("observed_zone_id", "observedZoneId"),
                number("standard_drinks", "standardDrinks"),
                text("follow_up_date", "followUpDate"),
                flag("follow_up_notified", "followUpNotified"),
                instant("observed_at", "observedAtEpochMs"),
            ),
            naturalKey = listOf("habitId", "localDate"),
        ),
        EntitySpec(
            "learned_question_settings", "learned_question_settings", same("habitId"), id("habitId"),
            listOf(
                habitRef(),
                flag("enabled"),
                text("ask_at", "askAt"),
                number("threshold_percent", "thresholdPercent"),
                text("muted_weekdays", "mutedWeekdays"),
                flag("silent_during_pauses", "silentDuringPauses"),
            ),
            naturalKey = listOf("habitId"),
        ),
        EntitySpec(
            "learned_question_record", "learned_question_records",
            { prefix -> "$prefix.habitId || '_' || $prefix.localDate" },
            { uid -> mapOf("habitId" to uid.dropLast(DATE_SUFFIX), "localDate" to uid.takeLast(DATE_SUFFIX - 1)) },
            listOf(
                habitRef(),
                text("local_date", "localDate"),
                text("outcome"),
                number("value_minor", "valueMinor"),
                instant("recorded_at", "recordedAtEpochMs"),
            ),
            naturalKey = listOf("habitId", "localDate"),
        ),
    )

    val order: List<String> = all.map { it.entity }
    val byEntity: Map<String, EntitySpec> = all.associateBy { it.entity }
}
