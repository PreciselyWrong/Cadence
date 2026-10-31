package ch.nicolab.cadence.reminder

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.MainActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.LearnedQuestionRepository
import ch.nicolab.cadence.designsystem.R as DesignR
import ch.nicolab.cadence.domain.LearnedAnswer
import ch.nicolab.cadence.domain.LearnedAnswerKind
import ch.nicolab.cadence.domain.LearnedQuestion
import ch.nicolab.cadence.habits.LearnedQuestionText
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Une alarme inexacte par heure de question active ; la question de la veille est livrée à cette heure. */
object LearnedQuestionScheduler {
    const val CHANNEL_ID = "learned_questions"
    const val ACTION_ASK = "ch.nicolab.cadence.reminder.LEARNED_QUESTION_ASK"
    const val ACTION_ANSWER = "ch.nicolab.cadence.reminder.LEARNED_QUESTION_ANSWER"
    const val EXTRA_MINUTE_OF_DAY = "learned_question_minute"
    const val EXTRA_HABIT_ID = "learned_question_habit_id"
    const val EXTRA_ANSWER = "learned_question_answer"
    private const val WINDOW_MILLIS = LearnedQuestionSchedule.WINDOW_MINUTES * 60 * 1000L
    private val GROUP_NOTIFICATION_ID = "learned-questions:group".hashCode()

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, context.getString(R.string.learned_question_channel), NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
    }

    suspend fun scheduleAll(context: Context, learned: LearnedQuestionRepository, now: ZonedDateTime = ZonedDateTime.now()) {
        learned.askTimes(now.toLocalDate()).forEach { askAt ->
            when (val decision = LearnedQuestionSchedule.decide(now, askAt)) {
                is LearnedQuestionSchedule.Decision.Today -> setAlarm(context, askAt, decision.trigger)
                is LearnedQuestionSchedule.Decision.Tomorrow -> setAlarm(context, askAt, decision.trigger)
                LearnedQuestionSchedule.Decision.Skip -> Unit
            }
        }
    }

    /** Appelé après la livraison : la question suivante est celle du lendemain à la même heure. */
    fun scheduleAfterDelivery(context: Context, askAt: LocalTime, now: ZonedDateTime = ZonedDateTime.now()) {
        setAlarm(context, askAt, LearnedQuestionSchedule.afterDelivery(now, askAt))
    }

    suspend fun deliver(context: Context, minuteOfDay: Int, today: LocalDate = LocalDate.now()) {
        val app = context.applicationContext as CadenceApp
        val questions = app.learnedQuestions.pendingQuestions(today)
            .filter { it.askAt.hour * 60 + it.askAt.minute == minuteOfDay }
        if (!canNotify(context)) return
        createChannel(context)
        val manager = NotificationManagerCompat.from(context)
        when (val plan = LearnedQuestionNotificationPlan.of(questions)) {
            LearnedQuestionNotificationPlan.None -> Unit
            is LearnedQuestionNotificationPlan.Single -> {
                val name = habitName(app, plan.question.habitId, today)
                manager.notify(notificationId(plan.question), single(context, plan.question, name))
            }
            is LearnedQuestionNotificationPlan.Grouped -> {
                val names = plan.questions.associate { it.habitId to habitName(app, it.habitId, today) }
                manager.notify(GROUP_NOTIFICATION_ID, grouped(context, plan.questions, names))
            }
        }
    }

    /** Retire la notification d'une question répondue, seule ou dans le groupe. */
    fun cancelAnswered(context: Context, habitId: String, date: LocalDate = LocalDate.now().minusDays(1)) {
        val manager = NotificationManagerCompat.from(context)
        manager.cancel(("learned-questions:$habitId:$date").hashCode())
        manager.cancel(GROUP_NOTIFICATION_ID)
    }

    private fun setAlarm(context: Context, askAt: LocalTime, trigger: ZonedDateTime) {
        context.getSystemService(AlarmManager::class.java).setWindow(
            AlarmManager.RTC_WAKEUP,
            trigger.toInstant().toEpochMilli(),
            WINDOW_MILLIS,
            askPendingIntent(context, askAt),
        )
    }

    private fun askPendingIntent(context: Context, askAt: LocalTime): PendingIntent {
        val minute = askAt.hour * 60 + askAt.minute
        return PendingIntent.getBroadcast(
            context,
            "learned-ask:$minute".hashCode(),
            Intent(context, LearnedQuestionReceiver::class.java)
                .setAction(ACTION_ASK)
                .putExtra(EXTRA_MINUTE_OF_DAY, minute),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private suspend fun habitName(app: CadenceApp, habitId: String, today: LocalDate): String =
        app.repository.getHabitEffectiveAt(habitId, today)?.name.orEmpty()

    private fun single(context: Context, question: LearnedQuestion, habitName: String): Notification {
        val dayPhrase = context.getString(R.string.learned_question_yesterday, LearnedQuestionText.weekdayName(question.weekday))
        val title = if (LearnedQuestionText.isAlcohol(question)) {
            context.getString(R.string.learned_question_alcohol_title, dayPhrase)
        } else {
            context.getString(R.string.learned_question_habit_title, dayPhrase, habitName)
        }
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(DesignR.drawable.ic_widget_mark)
            .setContentTitle(title)
            .setContentText(context.getString(R.string.learned_question_notification_text, LearnedQuestionText.weekdayName(question.weekday)))
            .setContentIntent(openIntent(context, question.habitId))
            .setAutoCancel(true)
        if (LearnedAnswerKind.NO in question.answerKinds) {
            builder.addAction(0, context.getString(R.string.learned_question_no), answerIntent(context, question, "NO"))
        }
        if (LearnedAnswerKind.YES in question.answerKinds) {
            val yes = when (LearnedQuestionYesAction.of(question)) {
                LearnedQuestionYesAction.ANSWER_IN_PLACE -> answerIntent(context, question, "YES")
                LearnedQuestionYesAction.OPEN_TO_ENTER_AMOUNT -> openIntent(context, question.habitId, enterAmount = true)
            }
            builder.addAction(0, context.getString(R.string.learned_question_yes), yes)
        } else {
            builder.addAction(0, context.getString(R.string.learned_question_precise), openIntent(context, question.habitId))
        }
        return builder.build()
    }

    private fun grouped(context: Context, questions: List<LearnedQuestion>, names: Map<String, String>): Notification {
        val style = NotificationCompat.InboxStyle()
        questions.forEach { style.addLine(names[it.habitId].orEmpty()) }
        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(DesignR.drawable.ic_widget_mark)
            .setContentTitle(context.getString(R.string.learned_question_group_title, questions.size))
            .setContentText(context.getString(R.string.learned_question_group_text))
            .setStyle(style)
            .setContentIntent(openIntent(context, null))
            .setAutoCancel(true)
            .build()
    }

    private fun notificationId(question: LearnedQuestion): Int =
        "learned-questions:${question.habitId}:${question.date}".hashCode()

    private fun openIntent(context: Context, habitId: String?, enterAmount: Boolean = false): PendingIntent =
        PendingIntent.getActivity(
            context,
            "learned-open:${habitId.orEmpty()}:$enterAmount".hashCode(),
            Intent(context, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_OPEN_QUESTION_HABIT_ID, habitId)
                .putExtra(MainActivity.EXTRA_OPEN_QUESTION_AMOUNT, enterAmount),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun answerIntent(context: Context, question: LearnedQuestion, answer: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            "learned-answer:${question.habitId}:${question.date}:$answer".hashCode(),
            Intent(context, LearnedQuestionReceiver::class.java)
                .setAction(ACTION_ANSWER)
                .putExtra(EXTRA_HABIT_ID, question.habitId)
                .putExtra(EXTRA_ANSWER, answer),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
}

class LearnedQuestionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as CadenceApp
                when (intent.action) {
                    LearnedQuestionScheduler.ACTION_ASK -> ask(context, app, intent)
                    LearnedQuestionScheduler.ACTION_ANSWER -> answer(context, app.learnedQuestions, intent)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun ask(context: Context, app: CadenceApp, intent: Intent) {
        val minute = intent.getIntExtra(LearnedQuestionScheduler.EXTRA_MINUTE_OF_DAY, -1)
        if (minute !in 0..1439) return
        LearnedQuestionScheduler.deliver(context, minute)
        val askAt = LocalTime.of(minute / 60, minute % 60)
        // Une heure désactivée entre-temps ne se reprogramme pas : sa chaîne s'arrête ici.
        if (askAt in app.learnedQuestions.askTimes()) LearnedQuestionScheduler.scheduleAfterDelivery(context, askAt)
    }

    private suspend fun answer(context: Context, learned: LearnedQuestionRepository, intent: Intent) {
        val habitId = intent.getStringExtra(LearnedQuestionScheduler.EXTRA_HABIT_ID) ?: return
        val answer = when (intent.getStringExtra(LearnedQuestionScheduler.EXTRA_ANSWER)) {
            "NO" -> LearnedAnswer.No
            "YES" -> LearnedAnswer.Yes
            else -> return
        }
        val question = learned.pendingQuestions().firstOrNull { it.habitId == habitId }
        // Un « Oui » alcool sans nombre de verres ne s'enregistre jamais depuis une notification (anciennes notifications comprises).
        val needsAmount = answer == LearnedAnswer.Yes && question != null &&
            LearnedQuestionYesAction.of(question) == LearnedQuestionYesAction.OPEN_TO_ENTER_AMOUNT
        if (question != null && !needsAmount) {
            try {
                learned.answer(question, answer)
            } catch (_: IllegalArgumentException) {
                // La réponse n'est plus offerte pour cette question : la notification disparaît sans rien écrire.
            }
        }
        LearnedQuestionScheduler.cancelAnswered(context, habitId)
    }
}
