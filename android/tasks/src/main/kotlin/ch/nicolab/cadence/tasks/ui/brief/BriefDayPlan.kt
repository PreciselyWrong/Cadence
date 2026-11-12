package ch.nicolab.cadence.tasks.ui.brief

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.planning.Capacity
import ch.nicolab.cadence.tasks.planning.DayPlans
import ch.nicolab.cadence.tasks.planning.PlanEdit
import ch.nicolab.cadence.tasks.planning.PlanningChanges
import ch.nicolab.cadence.tasks.ui.PlanningViewModel
import ch.nicolab.cadence.tasks.ui.TasksViewModel
import ch.nicolab.cadence.tasks.ui.TriageTarget
import java.time.LocalDate
import kotlinx.coroutines.launch

/** La planification du jour telle que Ma journée la montre : échues à trier, suggestions, tâches à placer. */
internal class DayPlanUi(
    val today: LocalDate,
    val overdue: List<TaskItem>,
    val suggestions: List<TaskItem>,
    val weekStart: LocalDate,
    val capacity: Capacity,
    val toPlaceCount: Int,
    val workday: Boolean,
    val onTriage: (List<TaskItem>, TriageTarget) -> Unit,
    val onAddToday: (TaskItem) -> Unit,
) {
    val hasContent: Boolean get() = overdue.isNotEmpty() || suggestions.isNotEmpty() || toPlaceCount > 0
}

@Composable
internal fun rememberDayPlan(tasksViewModel: TasksViewModel, planning: PlanningViewModel, snackbar: SnackbarHostState): DayPlanUi {
    val state by tasksViewModel.today.collectAsStateWithLifecycle()
    val moment by tasksViewModel.moment.collectAsStateWithLifecycle()
    val events by tasksViewModel.todayEvents.collectAsStateWithLifecycle()
    val suggestions by tasksViewModel.suggestions.collectAsStateWithLifecycle()
    val weekStart by tasksViewModel.weekStart.collectAsStateWithLifecycle()
    val settings by planning.settings.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val genericError = stringResource(R.string.tasks_error_generic)
    val undoLabel = stringResource(R.string.tasks_undo)
    val today = moment.today
    val zone = moment.zone
    val plan = remember(today, moment.now, zone, settings, events, state.today, state.plan) {
        DayPlans.of(
            day = today,
            zone = zone,
            settings = settings,
            events = events.map { it.event },
            dayTasks = state.today,
            notBefore = DayPlans.notBefore(today, moment.now, zone),
            planned = state.plan,
        )
    }
    val overdue = remember(state.overdue) { PlanningChanges.movable(state.overdue) }

    val plannedToday = remember(state.plan) { state.plan.mapTo(HashSet()) { it.uid } }

    /** Montre [message] avec « Annuler » ; [undo] défait l'écriture si l'utilisateur le demande. */
    suspend fun offerUndo(message: String, undo: suspend () -> Result<Unit>) {
        snackbar.currentSnackbarData?.dismiss()
        val result = snackbar.showSnackbar(message, undoLabel, duration = SnackbarDuration.Long)
        if (result == SnackbarResult.ActionPerformed) undo().onFailure { snackbar.showSnackbar(it.message ?: genericError) }
    }

    /** Aujourd'hui, Demain : le plan du jour change, jamais l'échéance (comme « Reporter » d'Aujourd'hui). */
    fun commitPlan(edits: List<PlanEdit>, message: String) {
        if (edits.isEmpty()) return
        scope.launch {
            planning.applyPlan(edits)
                .onFailure { snackbar.showSnackbar(it.message ?: genericError) }
                .onSuccess { undo -> offerUndo(message) { planning.undoPlan(undo) } }
        }
    }

    /** « Plus tard » : l'étiquette `someday`, l'échéance reste ; annuler la retire de celles qui ne l'avaient pas. */
    fun commitLater(tasks: List<TaskItem>, message: String) {
        if (tasks.isEmpty()) return
        scope.launch {
            planning.later(tasks)
                .onFailure { snackbar.showSnackbar(it.message ?: genericError) }
                .onSuccess { originals -> offerUndo(message) { planning.undoLater(originals) } }
        }
    }

    return DayPlanUi(
        today = today,
        overdue = overdue,
        suggestions = suggestions,
        weekStart = weekStart,
        capacity = plan.capacity,
        toPlaceCount = plan.toPlace.size,
        workday = plan.workday,
        onTriage = { tasks, target ->
            val plural = when (target) {
                TriageTarget.TODAY -> R.plurals.planning_moved_today
                TriageTarget.TOMORROW -> R.plurals.planning_moved_tomorrow
                TriageTarget.LATER -> R.plurals.planning_moved_later
            }
            val message = context.resources.getQuantityString(plural, tasks.size, tasks.size)
            when (target) {
                TriageTarget.TODAY -> commitPlan(tasks.map { PlanningChanges.planOn(it, today) }, message)
                TriageTarget.TOMORROW -> commitPlan(
                    tasks.map { PlanningChanges.reportPlan(it, today, today.plusDays(1), plannedToday = it.uid in plannedToday) },
                    message,
                )
                TriageTarget.LATER -> commitLater(tasks, message)
            }
        },
        onAddToday = { task ->
            commitPlan(
                listOf(PlanningChanges.planOn(task, today)),
                context.resources.getQuantityString(R.plurals.planning_moved_today, 1, 1),
            )
        },
    )
}
