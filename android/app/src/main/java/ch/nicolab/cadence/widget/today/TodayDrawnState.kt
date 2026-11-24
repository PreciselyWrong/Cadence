package ch.nicolab.cadence.widget.today

import ch.nicolab.cadence.tasks.model.ProjectItem
import ch.nicolab.cadence.tasks.model.TagColor
import ch.nicolab.cadence.widget.WidgetHabit
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Ce que le widget « Aujourd'hui » dessine, sans les images ni les champs que l'écran ignore. Un
 * redessin envoie de nouvelles vues au lanceur, et certains (Smart Launcher) montrent alors une
 * image décalée : une synchro qui réécrit les tâches (`pendingSync`, date de modification d'un
 * projet) ne doit donc pas redessiner. L'heure compte à la minute, pour les événements en cours.
 */
internal data class TodayDrawnState(
    val config: TodayWidgetConfig,
    val checkEvents: Boolean,
    val calendarAccessMissing: Boolean,
    val minute: Instant,
    val selection: TodaySelection,
    val habits: List<WidgetHabit>,
    /** Nom et couleur, seuls lus par les lignes. */
    val projects: Map<String, Pair<String, String?>>,
    val tagNames: Map<String, String>,
    val tagColors: Map<String, TagColor>,
    val today: LocalDate,
    val zone: ZoneId,
) {
    companion object {
        fun of(
            config: TodayWidgetConfig,
            checkEvents: Boolean,
            calendarAccessMissing: Boolean,
            now: Instant,
            selection: TodaySelection,
            habits: List<WidgetHabit>,
            projects: Map<String, ProjectItem>,
            tagNames: Map<String, String>,
            tagColors: Map<String, TagColor>,
            today: LocalDate,
            zone: ZoneId,
        ) = TodayDrawnState(
            config = config,
            checkEvents = checkEvents,
            calendarAccessMissing = calendarAccessMissing,
            minute = now.truncatedTo(ChronoUnit.MINUTES),
            selection = selection.copy(
                overdue = selection.overdue.map { it.copy(pendingSync = false) },
                tasks = selection.tasks.map { it.copy(pendingSync = false) },
            ),
            habits = habits,
            projects = projects.mapValues { (_, project) -> project.name to project.color },
            tagNames = tagNames,
            tagColors = tagColors,
            today = today,
            zone = zone,
        )
    }
}
