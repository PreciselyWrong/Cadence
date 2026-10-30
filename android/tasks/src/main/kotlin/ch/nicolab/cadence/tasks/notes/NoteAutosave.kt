package ch.nicolab.cadence.tasks.notes

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Titre et contenu d'une note : les deux champs saisis au clavier. */
data class NoteFields(val title: String, val content: String)

/** Champs modifiés d'une note ; null = inchangé. */
data class NotePatch(val title: String? = null, val content: String? = null)

/**
 * Fusion entre ce que l'utilisateur est en train de saisir et ce que la base émet (écho de ses
 * propres sauvegardes, ou note modifiée ailleurs puis synchronisée). Un champ modifié ici et pas encore
 * enregistré garde la saisie locale ; un champ intact suit la base. Les sauvegardes déjà parties ne
 * doivent jamais effacer des caractères tapés depuis.
 */
class NoteEditSession(initial: NoteFields) {
    private var base: NoteFields = initial
    var current: NoteFields = initial
        private set

    fun edit(title: String? = null, content: String? = null) {
        current = NoteFields(title ?: current.title, content ?: current.content)
    }

    /** Champs à écrire : seuls ceux qui diffèrent de la base. Null quand tout est enregistré. */
    fun pending(): NotePatch? {
        val patch = NotePatch(
            title = current.title.takeIf { it != base.title },
            content = current.content.takeIf { it != base.content },
        )
        return patch.takeIf { it.title != null || it.content != null }
    }

    /** Appelé quand [saved] est parti vers la base : ces valeurs ne sont plus à envoyer. */
    fun markSaved(saved: NotePatch) {
        base = NoteFields(saved.title ?: base.title, saved.content ?: base.content)
    }

    /** Intègre une émission de la base ; renvoie les champs à afficher. */
    fun merge(remote: NoteFields): NoteFields {
        current = NoteFields(
            title = if (current.title != base.title) current.title else remote.title,
            content = if (current.content != base.content) current.content else remote.content,
        )
        base = remote
        return current
    }
}

/**
 * Regroupe les saisies rapprochées : la sauvegarde part [delayMs] après la dernière, et [flush] l'envoie
 * tout de suite (fermeture de l'écran). Les sauvegardes sont sérialisées.
 */
class Autosaver<T : Any>(
    private val scope: CoroutineScope,
    private val delayMs: Long,
    private val save: suspend (T) -> Unit,
) {
    private var job: Job? = null
    private var latest: T? = null
    private val lock = Mutex()

    fun submit(value: T) {
        latest = value
        job?.cancel()
        job = scope.launch {
            delay(delayMs)
            drain()
        }
    }

    /** Envoie la dernière valeur en attente sans attendre le délai. */
    suspend fun flush() {
        job?.cancel()
        drain()
    }

    private suspend fun drain() = lock.withLock {
        val value = latest ?: return@withLock
        latest = null
        save(value)
    }
}
