package ch.nicolab.cadence.tasks.focus

import java.util.Base64

enum class PomodoroPhase(val durationMs: Long) {
    FOCUS(25 * 60_000L),
    SHORT_BREAK(5 * 60_000L),
    LONG_BREAK(15 * 60_000L),
}

/**
 * Minuteur de concentration. Le temps écoulé n'est jamais stocké : on garde l'instant de reprise et
 * le reste figé à la dernière pause, tout le reste se dérive de l'horloge ; un redémarrage du
 * processus retrouve donc la valeur exacte.
 */
data class PomodoroState(
    val phase: PomodoroPhase = PomodoroPhase.FOCUS,
    /** Instant de reprise ; null tant que le minuteur est en pause. */
    val resumedAtMs: Long? = null,
    /** Reste de la phase au moment de la dernière pause ou de l'entrée dans la phase. */
    val remainingAtResumeMs: Long = PomodoroPhase.FOCUS.durationMs,
    val completedFocus: Int = 0,
    val taskUid: String? = null,
) {
    val isRunning: Boolean get() = resumedAtMs != null

    fun remainingMs(nowMs: Long): Long {
        val resumed = resumedAtMs ?: return remainingAtResumeMs
        return (remainingAtResumeMs - (nowMs - resumed)).coerceAtLeast(0)
    }

    fun isFinished(nowMs: Long): Boolean = isRunning && remainingMs(nowMs) == 0L

    fun start(nowMs: Long): PomodoroState = if (isRunning) this else copy(resumedAtMs = nowMs)

    fun pause(nowMs: Long): PomodoroState =
        if (!isRunning) this else copy(resumedAtMs = null, remainingAtResumeMs = remainingMs(nowMs))

    /** Passe à la phase suivante, en pause : un temps de concentration terminé compte un cycle ; la quatrième pause est longue. */
    fun advance(): PomodoroState {
        val (next, focusDone) = when (phase) {
            PomodoroPhase.FOCUS -> {
                val done = completedFocus + 1
                (if (done % LONG_BREAK_EVERY == 0) PomodoroPhase.LONG_BREAK else PomodoroPhase.SHORT_BREAK) to done
            }
            else -> PomodoroPhase.FOCUS to completedFocus
        }
        return copy(phase = next, resumedAtMs = null, remainingAtResumeMs = next.durationMs, completedFocus = focusDone)
    }

    fun reset(): PomodoroState = idle().copy(taskUid = taskUid)

    fun encode(): String = listOf(
        phase.name,
        resumedAtMs?.toString().orEmpty(),
        remainingAtResumeMs.toString(),
        completedFocus.toString(),
        taskUid?.let { Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray()) }.orEmpty(),
    ).joinToString(SEPARATOR)

    companion object {
        private const val LONG_BREAK_EVERY = 4
        private const val SEPARATOR = "|"

        fun idle() = PomodoroState()

        /** Une valeur illisible redevient un minuteur au repos. */
        fun decode(raw: String?): PomodoroState = runCatching {
            val parts = raw.orEmpty().split(SEPARATOR)
            require(parts.size == 5)
            PomodoroState(
                phase = PomodoroPhase.valueOf(parts[0]),
                resumedAtMs = parts[1].toLongOrNull(),
                remainingAtResumeMs = parts[2].toLong(),
                completedFocus = parts[3].toInt(),
                taskUid = parts[4].takeIf { it.isNotEmpty() }?.let { String(Base64.getUrlDecoder().decode(it)) },
            )
        }.getOrDefault(idle())
    }
}
