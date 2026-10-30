package ch.nicolab.cadence.domain

import java.time.LocalTime

/** Ce que le widget retient des groupes d'habitudes. */
enum class WidgetGroupMode {
    /** Toutes les habitudes, quel que soit leur groupe. */
    ALL,

    /** `Journée` et les groupes actifs à l'heure courante. */
    AUTOMATIC,

    /** Un seul groupe choisi à la configuration. */
    SINGLE,
    ;

    companion object {
        fun fromStorage(raw: String?): WidgetGroupMode =
            entries.firstOrNull { it.name == raw } ?: ALL
    }
}

object WidgetGroupSelection {

    /**
     * Identifiants des groupes que le widget affiche, ou `null` lorsqu'aucun filtre ne
     * s'applique. Un mode `SINGLE` dont le groupe a disparu retombe sur tous les groupes
     * plutôt que de vider le widget.
     */
    fun visibleGroupIds(
        mode: WidgetGroupMode,
        groups: List<HabitGroup>,
        selectedGroupId: String?,
        time: LocalTime,
    ): Set<String>? = when (mode) {
        WidgetGroupMode.ALL -> null
        WidgetGroupMode.AUTOMATIC -> HabitGroup.activeAt(groups, time).map(HabitGroup::id).toSet()
        WidgetGroupMode.SINGLE -> selectedGroupId
            ?.takeIf { id -> groups.any { it.id == id } }
            ?.let(::setOf)
    }
}
