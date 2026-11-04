package ch.nicolab.cadence.tasks.brief

import ch.nicolab.cadence.tasks.TaskRepository
import ch.nicolab.cadence.tasks.model.TaskChange
import ch.nicolab.cadence.tasks.sync.DeferredCall

/** Écritures de tâches du brief, par le dépôt de tâches (outbox). */
internal class RepositoryBriefTasks(private val repository: TaskRepository) : BriefTaskWrites {
    override suspend fun complete(uid: String) = repository.completeTask(uid)
    override suspend fun reopen(uid: String) = repository.reopenTask(uid)
    override suspend fun write(uid: String, change: TaskChange) = repository.updateTask(uid, change)
}

/** File d'appels différés : l'envoi passe par le dépôt (qui relance la synchro), l'annulation retire la ligne gardée. */
internal class DeferredBriefQueue(
    private val defer: suspend (DeferredCall) -> Unit,
    private val cancelKey: suspend (String) -> Unit,
) : BriefQueue {
    override suspend fun enqueue(call: DeferredCall) = defer(call)
    override suspend fun cancel(key: String) = cancelKey(key)
}
