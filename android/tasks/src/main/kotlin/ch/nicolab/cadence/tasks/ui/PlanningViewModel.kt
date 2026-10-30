package ch.nicolab.cadence.tasks.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.PlanningChanges
import ch.nicolab.cadence.tasks.planning.PlanningStore
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CancellationException

/**
 * Écritures de la planification (triage, propositions acceptées, fin de journée) et état local du
 * jour. Chaque écriture passe par `TaskRepository.updateTask` : elle est locale d'abord, puis
 * synchronisée comme n'importe quelle modification de tâche.
 */
internal class PlanningViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.repository(application)
    private val store = PlanningStore.of(application)

    val settings = store.settings
    val dismissedDay = store.dismissedDay
    val closedDay = store.closedDay

    /** Applique les changements ; renvoie les tâches d'origine, à rendre à [restore] pour annuler. */
    suspend fun apply(changes: List<Pair<TaskItem, TaskChange>>): Result<List<TaskItem>> =
        attempt {
            changes.forEach { (task, change) -> repository.updateTask(task.uid, change) }
            repository.requestSync()
            changes.map { it.first }
        }

    suspend fun restore(originals: List<TaskItem>, zone: ZoneId): Result<Unit> =
        attempt {
            originals.forEach { repository.updateTask(it.uid, PlanningChanges.restore(it, zone)) }
            repository.requestSync()
        }

    fun dismissMorning(day: LocalDate) = store.dismissMorning(day)

    fun closeDay(day: LocalDate) = store.closeDay(day)

    fun reopenDay() = store.reopenDay()

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
}
