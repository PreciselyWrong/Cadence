package ch.nicolab.cadence.tasks.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.PlanEdit
import ch.nicolab.cadence.tasks.planning.PlanEdits
import ch.nicolab.cadence.tasks.planning.PlanUndo
import ch.nicolab.cadence.tasks.planning.PlanningChanges
import ch.nicolab.cadence.tasks.planning.PlanningStore
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Écritures de la planification (triage, propositions acceptées, fin de journée) et état local du
 * jour. Le jour prévu et les créneaux passent par le plan du jour (`PlanEdits`), jamais par
 * l'échéance ; seul « Plus tard » écrit la tâche (étiquette `someday`), par `TaskRepository.updateTask`.
 */
internal class PlanningViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = TasksGraph.repository(application)
    private val store = PlanningStore.of(application)
    private val planEdits: PlanEdits = TasksGraph.planEdits(application)

    val settings = store.settings
    val dismissedDay = store.dismissedDay
    val closedDay = store.closedDay

    private val _placementRequested = MutableStateFlow(false)
    /** « Placer automatiquement » dans Ma journée : Aujourd'hui montre les créneaux proposés. */
    val placementRequested: StateFlow<Boolean> = _placementRequested.asStateFlow()

    fun requestPlacement() {
        _placementRequested.value = true
    }

    fun placementHandled() {
        _placementRequested.value = false
    }

    /** « Plus tard » : l'étiquette `someday`, l'échéance reste ; renvoie les tâches d'origine pour [undoLater]. */
    suspend fun later(tasks: List<TaskItem>): Result<List<TaskItem>> =
        attempt {
            tasks.forEach { repository.updateTask(it.uid, PlanningChanges.later()) }
            repository.requestSync()
            tasks
        }

    /** Défait [later] : retire `someday` des tâches qui ne l'avaient pas. */
    suspend fun undoLater(originals: List<TaskItem>): Result<Unit> =
        attempt {
            originals.filterNot { it.someday }.forEach { repository.updateTask(it.uid, TaskChange(later = false)) }
            repository.requestSync()
        }

    /** Écritures du plan (Reporter, Placer) : locales d'abord, en file ensuite ; rend l'annulation, qui défait le plan. */
    suspend fun applyPlan(edits: List<PlanEdit>): Result<PlanUndo> = attempt { planEdits.apply(edits) }

    suspend fun undoPlan(undo: PlanUndo): Result<Unit> = attempt { undo() }

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
