package ch.nicolab.cadence.tasks.reminder

import ch.nicolab.cadence.domain.QuietPolicy
import ch.nicolab.cadence.tasks.model.TaskItem
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Report d'une notification de rappel de tâche : « 10 min », « À la fin » (fin estimée) ou « Demain ». */
enum class TaskSnoozeChoice { TEN_MINUTES, UNTIL_END, TOMORROW }

/** Règles du report d'une notification de tâche, sans Android. */
object TaskSnoozeRules {
    val TEN_MINUTES: Duration = Duration.ofMinutes(10)

    /** Sous ce délai avant la fin, « À la fin » n'a plus de sens : la notification ne le propose pas. */
    val MIN_TIME_BEFORE_END: Duration = Duration.ofMinutes(5)

    /** Fin estimée d'une tâche horaire : échéance + durée. Null sans heure, sans durée ou presque finie. */
    fun endOf(task: TaskItem, now: Instant): Instant? {
        val due = task.dueDate?.takeIf { task.dueHasTime } ?: return null
        val minutes = task.estimatedMinutes?.takeIf { it > 0 } ?: return null
        val end = due.plusSeconds(minutes * 60L)
        return end.takeIf { Duration.between(now, it) >= MIN_TIME_BEFORE_END }
    }

    /** Reports proposés après « Fait » : « À la fin » si la tâche le permet, sinon « 10 min », puis « Demain ». */
    fun offered(task: TaskItem, now: Instant): List<TaskSnoozeChoice> =
        listOf(if (endOf(task, now) != null) TaskSnoozeChoice.UNTIL_END else TaskSnoozeChoice.TEN_MINUTES, TaskSnoozeChoice.TOMORROW)

    /**
     * Heure du report, décalée hors plage silencieuse ; null si « À la fin » n'a plus lieu.
     * « Demain » garde l'heure d'horloge du moment, dans le fuseau [zone].
     */
    fun triggerAt(choice: TaskSnoozeChoice, task: TaskItem, now: Instant, zone: ZoneId, quiet: QuietPolicy): Instant? {
        val wanted = when (choice) {
            TaskSnoozeChoice.TEN_MINUTES -> now.plus(TEN_MINUTES)
            TaskSnoozeChoice.UNTIL_END -> endOf(task, now) ?: return null
            TaskSnoozeChoice.TOMORROW -> now.atZone(zone).plusDays(1).toInstant()
        }
        return quiet.shift(wanted)
    }
}
