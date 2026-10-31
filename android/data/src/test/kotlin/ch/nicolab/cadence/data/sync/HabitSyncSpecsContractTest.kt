package ch.nicolab.cadence.data.sync

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * Contrat entre `docs/21-habits.md` (section « Cadence habits »), les entités Room et `HabitSyncSpecs`.
 * Les listes sont recopiées à la main : un changement d'un côté doit casser ce test.
 */
class HabitSyncSpecsContractTest {

    private val docFields: Map<String, List<String>> = linkedMapOf(
        "habit_group" to listOf("name", "start_minute", "end_minute", "sort_order"),
        "habit" to listOf(
            "group_uid", "name", "description", "icon_id", "color_argb", "active", "starts_on", "archived",
            "sort_order", "client_created_at", "timer_enabled", "abstinence_profile", "abstinence_started_at",
            "abstinence_spending_minor", "abstinence_spending_period", "abstinence_savings_currency",
            "alcohol_follow_up_time",
        ),
        "habit_goal" to listOf(
            "habit_uid", "target_minor", "period", "goal_type", "unit_id", "unit_dimension", "unit_name_fr",
            "unit_symbol", "unit_scale_to_canonical", "frequency_target", "minimum_minor", "direction",
            "progression_step", "progression_cadence", "progression_cap_minor", "progression_starts_on",
            "effective_from",
        ),
        "habit_schedule" to listOf(
            "habit_uid", "schedule_mode", "active_days", "first_day_of_week", "effective_from", "interval_days",
        ),
        "habit_entry" to listOf(
            "habit_uid", "occurred_at", "local_date", "observed_zone_id", "value_minor", "source", "session_id", "note",
        ),
        "habit_pause" to listOf("habit_uid", "start", "end_exclusive", "reason", "reason_label"),
        "habit_quick_value" to listOf("habit_uid", "label", "amount_minor", "sort_order"),
        "habit_reminder" to listOf("habit_uid", "time", "days_of_week", "enabled", "conditional"),
        "habit_timer" to listOf("habit_uid", "accumulated_seconds", "running_since"),
        "health_connect_rule" to listOf("habit_uid", "exercise_types", "data_origin_package", "enabled"),
        "health_connect_import" to listOf("habit_uid", "record_id", "entry_uid", "data_origin_package", "state"),
        "abstinence_log" to listOf("habit_uid", "occurred_at", "local_date", "observed_zone_id", "kind", "intensity", "note"),
        "alcohol_consumption" to listOf(
            "habit_uid", "local_date", "observed_zone_id", "standard_drinks", "follow_up_date",
            "follow_up_notified", "observed_at",
        ),
        "learned_question_settings" to listOf(
            "habit_uid", "enabled", "ask_at", "threshold_percent", "muted_weekdays", "silent_during_pauses",
        ),
        "learned_question_record" to listOf("habit_uid", "local_date", "outcome", "value_minor", "recorded_at"),
    )

    /** Colonnes Room portées par les champs synchronisés (sans `id`), relevées dans les classes d'entité. */
    private val roomColumns: Map<String, Set<String>> = mapOf(
        "habit_group" to setOf("name", "startMinute", "endMinute", "sortOrder"),
        "habit" to setOf(
            "groupId", "name", "description", "iconId", "colorArgb", "active", "startsOn", "archived", "sortOrder",
            "createdAtEpochMs", "timerEnabled", "abstinenceProfile", "abstinenceStartedAtEpochMs",
            "abstinenceSpendingMinor", "abstinenceSpendingPeriod", "abstinenceSavingsCurrency", "alcoholFollowUpTime",
        ),
        "habit_goal" to setOf(
            "habitId", "targetMinor", "period", "goalType", "unitId", "unitDimension", "unitNameFr", "unitSymbol",
            "unitScaleToCanonical", "frequencyTarget", "minimumMinor", "direction", "progressionStep",
            "progressionCadence", "progressionCapMinor", "progressionStartsOn", "effectiveFrom",
        ),
        "habit_schedule" to setOf("habitId", "scheduleMode", "activeDays", "firstDayOfWeek", "effectiveFrom", "intervalDays"),
        "habit_entry" to setOf(
            "habitId", "occurredAtEpochMs", "localDate", "observedZoneId", "valueMinor", "source", "sessionId", "note",
        ),
        "habit_pause" to setOf("habitId", "start", "endExclusive", "reason", "reasonLabel"),
        "habit_quick_value" to setOf("habitId", "label", "amountMinor", "sortOrder"),
        "habit_reminder" to setOf("habitId", "time", "daysOfWeek", "enabled", "conditional"),
        "habit_timer" to setOf("habitId", "accumulatedSeconds", "runningSinceEpochMs"),
        "health_connect_rule" to setOf("habitId", "exerciseTypes", "dataOriginPackage", "enabled"),
        "health_connect_import" to setOf("habitId", "recordId", "entryId", "dataOriginPackage", "state"),
        "abstinence_log" to setOf("habitId", "occurredAtEpochMs", "localDate", "observedZoneId", "kind", "intensity", "note"),
        "alcohol_consumption" to setOf(
            "habitId", "localDate", "observedZoneId", "standardDrinks", "followUpDate", "followUpNotified",
            "observedAtEpochMs",
        ),
        "learned_question_settings" to setOf(
            "habitId", "enabled", "askAt", "thresholdPercent", "mutedWeekdays", "silentDuringPauses",
        ),
        "learned_question_record" to setOf("habitId", "localDate", "outcome", "valueMinor", "recordedAtEpochMs"),
    )

    /** Classe d'entité Room de chaque entité synchronisée. */
    private val entityClasses: Map<String, String> = mapOf(
        "habit_group" to "HabitGroupEntity",
        "habit" to "HabitEntity",
        "habit_goal" to "HabitGoalEntity",
        "habit_schedule" to "HabitScheduleEntity",
        "habit_entry" to "HabitEntryEntity",
        "habit_pause" to "HabitPauseEntity",
        "habit_quick_value" to "HabitQuickValueEntity",
        "habit_reminder" to "HabitReminderEntity",
        "habit_timer" to "HabitTimerEntity",
        "health_connect_rule" to "HealthConnectRuleEntity",
        "health_connect_import" to "HealthConnectImportEntity",
        "abstinence_log" to "AbstinenceLogEntity",
        "alcohol_consumption" to "AlcoholConsumptionEntity",
        "learned_question_settings" to "LearnedQuestionSettingsEntity",
        "learned_question_record" to "LearnedQuestionRecordEntity",
    )

    /** Colonnes à NULL dans l'échantillon, pour exercer le chemin null de chaque entité. */
    private val nullableSamples: Map<String, Set<String>> = mapOf(
        "habit_group" to setOf("startMinute", "endMinute"),
        "habit" to setOf("description", "abstinenceSpendingMinor", "alcoholFollowUpTime"),
        "habit_goal" to setOf("unitId", "minimumMinor", "progressionCapMinor"),
        "habit_entry" to setOf("sessionId", "note"),
        "habit_pause" to setOf("endExclusive", "reason"),
        "habit_timer" to setOf("runningSinceEpochMs"),
        "health_connect_rule" to setOf("dataOriginPackage"),
        "abstinence_log" to setOf("intensity", "note"),
        "alcohol_consumption" to setOf("standardDrinks", "observedAtEpochMs"),
        "learned_question_record" to setOf("valueMinor"),
    )

    private fun spec(entity: String) = HabitSyncSpecs.byEntity.getValue(entity)

    /** Échantillon cohérent avec le genre de chaque champ : texte, entier, booléen 0/1, instant en ms. */
    private fun sampleRow(entity: String): Map<String, Any?> {
        val nulls = nullableSamples[entity].orEmpty()
        return spec(entity).fields.associate { field ->
            val value: Any? = when {
                field.column in nulls -> null
                field.kind == ColumnKind.TEXT -> "x-${field.column}"
                field.kind == ColumnKind.NUMBER -> 42L
                field.kind == ColumnKind.BOOLEAN -> 1L
                else -> 1_760_000_000_123L
            }
            field.column to value
        }
    }

    @Test
    fun `chaque entite porte exactement les champs de la doc`() {
        HabitSyncSpecs.all.forEach { spec ->
            assertEquals(docFields.getValue(spec.entity), spec.fields.map { it.wire }, spec.entity)
        }
    }

    @Test
    fun `l'ordre d'envoi suit la doc`() {
        assertEquals(docFields.keys.toList(), HabitSyncSpecs.order)
    }

    @Test
    fun `chaque colonne est une propriete de la classe d'entite Room`() {
        HabitSyncSpecs.all.forEach { spec ->
            val columns = spec.fields.map { it.column }.toSet()
            assertEquals(roomColumns.getValue(spec.entity), columns, spec.entity)

            val declared = Class.forName("ch.nicolab.cadence.data.local.entities.${entityClasses.getValue(spec.entity)}")
                .declaredFields.map { it.name }.toSet()
            assertEquals(emptySet<String>(), columns - declared, spec.entity)
        }
    }

    @Test
    fun `aller-retour wire sans perte pour chaque entite`() {
        HabitSyncSpecs.all.forEach { spec ->
            val row = sampleRow(spec.entity)
            val json = JsonObject(HabitWire.rowToWire(spec, row))
            val back = HabitWire.wireToColumns(spec, json)
            val expected = spec.fields.associate { it.column to row[it.column] }
            assertEquals(expected, back, spec.entity)
        }
    }

    @Test
    fun `habit group_uid null prend le groupe jour`() {
        val json = JsonObject(mapOf("group_uid" to JsonNull))
        val columns = HabitWire.wireToColumns(spec("habit"), json)
        assertEquals("group-day", columns["groupId"])
    }

    @Test
    fun `habit client_created_at null prend created_at du serveur, sinon 0`() {
        val withServerTime = JsonObject(
            mapOf(
                "client_created_at" to JsonNull,
                "created_at" to JsonPrimitive("2026-10-05T21:30:00Z"),
            ),
        )
        assertEquals(
            1_791_235_800_000L,
            HabitWire.wireToColumns(spec("habit"), withServerTime)["createdAtEpochMs"],
        )

        val withoutServerTime = JsonObject(mapOf("client_created_at" to JsonNull))
        assertEquals(0L, HabitWire.wireToColumns(spec("habit"), withoutServerTime)["createdAtEpochMs"])
    }

    @Test
    fun `un instant formate se relit a l'identique`() {
        val text = WireValues.formatInstantMs(1_760_000_000_123L)
        assertEquals(1_760_000_000_123L, WireValues.parseInstantMs(text))
    }

    @Test
    fun `un instant avec decalage horaire est converti en UTC`() {
        assertEquals(1_791_228_600_000L, WireValues.parseInstantMs("2026-10-05T21:30:00+02:00"))
    }

    @Test
    fun `un instant mal forme donne null`() {
        assertNull(WireValues.parseInstantMs("pas une date"))
    }

    @Test
    fun `un nombre texte leve MalformedRow`() {
        val json = JsonObject(mapOf("target_minor" to JsonPrimitive("abc")))
        assertThrows(MalformedRow::class.java) {
            HabitWire.wireToColumns(spec("habit_goal"), json)
        }
    }

    @Test
    fun `un booleen envoye en nombre leve MalformedRow`() {
        val json = JsonObject(mapOf("active" to JsonPrimitive(1)))
        assertThrows(MalformedRow::class.java) {
            HabitWire.wireToColumns(spec("habit"), json)
        }
    }

    @Test
    fun `learned_question_record se localise par habitId et date`() {
        val locate = spec("learned_question_record").locate("0b1c2d3e-aaaa-bbbb-cccc-0123456789ab_2026-10-05")
        assertEquals(
            mapOf("habitId" to "0b1c2d3e-aaaa-bbbb-cccc-0123456789ab", "localDate" to "2026-10-05"),
            locate,
        )
    }

    @Test
    fun `health_connect_import et habit_timer se localisent par leur cle primaire`() {
        assertEquals(mapOf("entryId" to "entry-1"), spec("health_connect_import").locate("entry-1"))
        assertEquals(mapOf("habitId" to "habit-1"), spec("habit_timer").locate("habit-1"))
    }

    @Test
    fun `uidSql de learned_question_record concatene habitId et localDate`() {
        assertEquals(
            "NEW.habitId || '_' || NEW.localDate",
            spec("learned_question_record").uidSql("NEW"),
        )
    }
}
