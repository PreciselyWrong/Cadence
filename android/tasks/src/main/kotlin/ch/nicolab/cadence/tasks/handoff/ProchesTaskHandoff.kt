package ch.nicolab.cadence.tasks.handoff

import ch.nicolab.cadence.domain.handoff.HandoffRequest
import ch.nicolab.cadence.domain.handoff.ProchesHandoff
import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.model.TaskDraft
import kotlinx.coroutines.flow.first

/** Range une tâche remise par Proches dans la file de synchronisation, une seule fois par proposition. */
object ProchesTaskHandoff {
    /**
     * Crée la tâche si son uid n'existe pas encore : une même proposition remise deux fois ne donne qu'une tâche.
     * Passe par [TaskRepository.createTask], donc par la même file d'envoi que la saisie de l'interface.
     */
    suspend fun store(repository: TaskRepository, request: HandoffRequest): Boolean {
        val uid = ProchesHandoff.taskUid(request.proposalId)
        if (repository.observeTask(uid).first() == null) {
            repository.createTask(TaskDraft(name = request.title, dueDate = request.dueDate, uid = uid))
        }
        return true
    }
}
