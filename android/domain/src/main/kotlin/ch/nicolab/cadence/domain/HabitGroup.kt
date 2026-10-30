package ch.nicolab.cadence.domain

import java.time.LocalTime

/**
 * Un moment de la journée auquel une habitude appartient.
 *
 * Un groupe sans horaire (`Journée`) est actif en permanence. Un groupe avec horaire couvre
 * `[startMinute, endMinute[` et peut traverser minuit lorsque la fin précède le début.
 * Les chevauchements entre groupes sont volontairement autorisés : une habitude appartient
 * à un seul groupe, mais plusieurs groupes peuvent être actifs au même instant.
 */
data class HabitGroup(
    val id: String,
    val name: String,
    val startMinute: Int?,
    val endMinute: Int?,
    val sortOrder: Int,
) {
    init {
        require(id.isNotBlank()) { "Group id cannot be blank" }
        require(name.isNotBlank()) { "Group name cannot be blank" }
        require((startMinute == null) == (endMinute == null)) {
            "A group defines both bounds or none"
        }
        startMinute?.let { require(it in 0 until MINUTES_PER_DAY) { "Start minute is out of the day" } }
        endMinute?.let { require(it in 0 until MINUTES_PER_DAY) { "End minute is out of the day" } }
    }

    /** Un groupe sans horaire reste proposé quelle que soit l'heure. */
    val isAllDay: Boolean get() = startMinute == null

    /**
     * Vrai lorsque l'heure locale tombe dans la plage. Une plage dont la fin est égale au
     * début couvre l'horloge entière : c'est la seule lecture qui reste continue quand on
     * fait glisser la fin d'une minute au-delà du début.
     */
    fun isActiveAt(time: LocalTime): Boolean {
        val start = startMinute ?: return true
        val end = endMinute ?: return true
        val minute = time.hour * 60 + time.minute
        return if (start <= end) {
            if (start == end) true else minute >= start && minute < end
        } else {
            minute >= start || minute < end
        }
    }

    companion object {
        const val MINUTES_PER_DAY = 24 * 60
        const val ALL_DAY_ID = "group-day"

        /**
         * Groupes livrés à la première ouverture. Les noms et les plages restent modifiables ;
         * seul `Journée` conserve sa nature de groupe sans horaire.
         */
        fun defaults(): List<HabitGroup> = listOf(
            HabitGroup(ALL_DAY_ID, "Journée", null, null, 0),
            HabitGroup("group-morning", "Matin", 5 * 60, 12 * 60, 1),
            HabitGroup("group-afternoon", "Après-midi", 12 * 60, 18 * 60, 2),
            HabitGroup("group-evening", "Soir", 18 * 60, 23 * 60, 3),
        )

        /** Groupes proposés à une heure donnée, dans l'ordre choisi par la personne. */
        fun activeAt(groups: List<HabitGroup>, time: LocalTime): List<HabitGroup> =
            groups.sortedBy(HabitGroup::sortOrder).filter { it.isActiveAt(time) }
    }
}
