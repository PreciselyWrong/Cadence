package ch.nicolab.cadence.tasks.sync

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * [owner] : compte auquel appartiennent les habitudes du téléphone ; [current] : compte connecté ;
 * [keptLocal] : compte pour lequel la personne a choisi de garder ces habitudes sur le téléphone seulement.
 * Gardé hors du DataStore de connexion, que la déconnexion efface.
 */
data class HabitOwnerState(
    val owner: String? = null,
    val current: String? = null,
    val keptLocal: String? = null,
)

interface HabitOwnerStore {
    val state: Flow<HabitOwnerState>
    suspend fun update(change: (HabitOwnerState) -> HabitOwnerState)
}

/** Ce que la garde touche dans la base des habitudes. */
interface LocalHabits {
    suspend fun hasRows(): Boolean
    suspend fun clearOutbox()
    suspend fun deleteAll()
}

/**
 * Les habitudes restent sur le téléphone à la déconnexion (elles sont locales d'abord) : connecter
 * ensuite un autre compte ne doit jamais les lui envoyer. Tant que le compte connecté n'est pas
 * celui des habitudes, leur synchro est coupée dans les deux sens et la personne choisit : les garder
 * sur ce téléphone seulement, ou les supprimer pour recevoir celles du nouveau compte.
 */
class HabitOwnership(private val store: HabitOwnerStore, private val habits: LocalHabits?) {
    enum class Outcome { OWNED, FOREIGN }

    suspend fun onConnect(account: String): Outcome {
        val owner = store.state.first().owner
        if (owner == null || owner == account || habits?.hasRows() != true) {
            store.update { it.copy(owner = account, current = account, keptLocal = null) }
            return Outcome.OWNED
        }
        // Écritures faites pour l'ancien compte : elles ne partent pas vers celui-ci.
        habits.clearOutbox()
        store.update { it.copy(current = account) }
        return Outcome.FOREIGN
    }

    /** Installation connectée avant cette garde : son compte est celui des habitudes. */
    suspend fun adoptIfUnknown(account: String) {
        store.update { state ->
            if (state.owner == null) state.copy(owner = account, current = account)
            else state.copy(current = state.current ?: account)
        }
    }

    suspend fun onDisconnect() {
        store.update { it.copy(current = null) }
    }

    suspend fun syncAllowed(): Boolean {
        val state = store.state.first()
        return state.current != null && state.owner == state.current
    }

    /** Vrai tant que des habitudes d'un autre compte attendent la décision. */
    fun observeForeign(): Flow<Boolean> = store.state
        .map { it.current != null && it.owner != null && it.owner != it.current && it.keptLocal != it.current }
        .distinctUntilChanged()

    suspend fun keepLocal() {
        store.update { it.copy(keptLocal = it.current) }
    }

    /** Supprime les habitudes de l'ancien compte : le compte connecté devient leur propriétaire. */
    suspend fun deleteLocal() {
        habits?.deleteAll()
        store.update { it.copy(owner = it.current, keptLocal = null) }
    }

    companion object {
        fun accountId(serverUrl: String, userUid: String?, email: String?): String =
            "$serverUrl|${userUid ?: email ?: ""}"
    }
}
