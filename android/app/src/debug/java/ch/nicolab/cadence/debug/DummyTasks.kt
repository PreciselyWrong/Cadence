package ch.nicolab.cadence.debug

import android.content.Context
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.model.TaskDraft
import java.time.LocalDate
import kotlinx.coroutines.flow.first

/**
 * Journée de démonstration pour juger Aujourd'hui sur l'émulateur : échues, tâches du jour avec et sans heure,
 * demain. Uids stables : un second envoi n'ajoute rien.
 */
internal object DummyTasks {
    fun drafts(today: LocalDate): List<TaskDraft> = listOf(
        TaskDraft(uid = "dummy-task-tyres", name = "Charger les pneus", dueDate = today.minusDays(3)),
        TaskDraft(uid = "dummy-task-mail", name = "Répondre à l'école de natation", dueDate = today.minusDays(1), priority = 1),
        TaskDraft(uid = "dummy-task-sport", name = "Sport", dueDate = today, dueTime = "14:00"),
        TaskDraft(uid = "dummy-task-dog", name = "Sortir le chien", dueDate = today, dueTime = "07:30"),
        TaskDraft(uid = "dummy-task-batch", name = "Préparer les marinades du batch", dueDate = today, dueTime = "18:00"),
        TaskDraft(uid = "dummy-task-dinner", name = "Repas William et Ruben", dueDate = today, dueTime = "19:00"),
        TaskDraft(uid = "dummy-task-ticktick", name = "Couper le renouvellement de TickTick", dueDate = today),
        TaskDraft(uid = "dummy-task-compta", name = "Comptabilité Nakama", dueDate = today, priority = 2),
        TaskDraft(uid = "dummy-task-call", name = "Appeler le garage pour le contrôle", dueDate = today, dueTime = "10:30"),
        TaskDraft(uid = "dummy-task-plants", name = "Arroser les plantes du balcon", dueDate = today),
        TaskDraft(uid = "dummy-task-gift", name = "Choisir le cadeau de Victoria", dueDate = today.plusDays(1)),
    )

    suspend fun seed(context: Context, today: LocalDate) {
        val repository = TasksGraph.repository(context)
        val known = repository.observeTasks().first().mapTo(HashSet()) { it.uid }
        drafts(today).filter { it.uid !in known }.forEach { repository.createTask(it) }
    }
}
