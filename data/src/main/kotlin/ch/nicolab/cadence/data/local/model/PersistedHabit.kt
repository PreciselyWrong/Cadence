package ch.nicolab.cadence.data.local.model

import ch.nicolab.cadence.domain.AbstinenceProfile
import ch.nicolab.cadence.domain.HabitDefinition
import ch.nicolab.cadence.domain.HabitGoal
import ch.nicolab.cadence.domain.HabitGroup
import ch.nicolab.cadence.domain.HabitSchedule
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId

data class PersistedHabit(
    val id: String,
    val name: String,
    val description: String? = null,
    val iconId: String? = null,
    val colorArgb: Int? = null,
    val active: Boolean,
    val startsOn: LocalDate = LocalDate.of(1970, 1, 1),
    val archived: Boolean = false,
    val sortOrder: Int = 0,
    val createdAtEpochMs: Long = 0L,
    val updatedAtEpochMs: Long = 0L,
    val groupId: String = HabitGroup.ALL_DAY_ID,
    /** Mode chronomètre proposé dans la saisie rapide; sans effet hors objectif en durée. */
    val timerEnabled: Boolean = false,
    val abstinenceProfile: AbstinenceProfile = AbstinenceProfile.NONE,
    val abstinenceStartedAt: Instant? = null,
    val goal: HabitGoal,
    val schedule: HabitSchedule,
) {
    fun abstinenceStartedOn(zoneId: ZoneId = ZoneId.systemDefault()): LocalDate? =
        abstinenceStartedAt?.atZone(zoneId)?.toLocalDate()

    val definition: HabitDefinition
        get() = HabitDefinition(
            id = id,
            name = name,
            description = description,
            iconId = iconId,
            colorArgb = colorArgb,
            active = active,
            startsOn = startsOn,
            archived = archived,
            sortOrder = sortOrder,
            updatedAtEpochMs = updatedAtEpochMs,
            groupId = groupId,
            goal = goal,
            schedule = schedule,
        )

    constructor(
        id: String,
        name: String,
        active: Boolean,
        goal: HabitGoal,
        schedule: HabitSchedule,
    ) : this(
        id = id,
        name = name,
        description = null,
        iconId = null,
        colorArgb = null,
        active = active,
        startsOn = LocalDate.of(1970, 1, 1),
        archived = false,
        sortOrder = 0,
        createdAtEpochMs = 0L,
        updatedAtEpochMs = 0L,
        groupId = HabitGroup.ALL_DAY_ID,
        goal = goal,
        schedule = schedule,
    )
}
