package ch.nicolab.cadence.tasks.sync

/**
 * Horloge hybride, même format et mêmes règles que `backend/modules/sync/hlc.js` :
 * `<13 chiffres ms>-<4 chiffres compteur>-<nœud>`. La comparaison de chaînes
 * ordonne alors les écritures. Chaque horloge reçue du serveur est observée pour
 * que nos écritures suivantes la dépassent.
 */
class Hlc(
    private val node: String,
    initial: String? = null,
    private val wallClock: () -> Long = System::currentTimeMillis,
) {
    private var ms = 0L
    private var counter = 0

    init {
        parse(initial)?.let { (initialMs, initialCounter) ->
            ms = initialMs
            counter = initialCounter
        }
    }

    @Synchronized
    fun now(): String {
        val wall = wallClock()
        when {
            wall > ms -> {
                ms = wall
                counter = 0
            }
            // Le compteur tient sur quatre chiffres : au-delà, on avance la milliseconde.
            counter >= MAX_COUNTER -> {
                ms += 1
                counter = 0
            }
            else -> counter += 1
        }
        return state()
    }

    /** Ignore les valeurs mal formées et les horloges trop en avance pour être honnêtes. */
    @Synchronized
    fun observe(value: String) {
        val (remoteMs, remoteCounter) = parse(value) ?: return
        if (remoteMs > wallClock() + MAX_FUTURE_MS) return
        if (remoteMs > ms || (remoteMs == ms && remoteCounter > counter)) {
            ms = remoteMs
            counter = remoteCounter
        }
    }

    /** Dernière valeur émise ou observée, à conserver pour le redémarrage. */
    @Synchronized
    fun state(): String = format(ms, counter, node)

    companion object {
        const val MAX_COUNTER = 9999

        /** Au-delà, un appareil gagnerait toutes les fusions jusqu'au rattrapage du temps réel. */
        private const val MAX_FUTURE_MS = 24 * 60 * 60 * 1000L
        private val FORMAT = Regex("""(\d{13})-(\d{4})-([A-Za-z0-9_.:-]{1,64})""")

        private fun parse(value: String?): Pair<Long, Int>? {
            val match = value?.let { FORMAT.matchEntire(it) } ?: return null
            return match.groupValues[1].toLong() to match.groupValues[2].toInt()
        }

        private fun format(ms: Long, counter: Int, node: String): String =
            "${ms.toString().padStart(13, '0')}-${counter.toString().padStart(4, '0')}-$node"
    }
}
