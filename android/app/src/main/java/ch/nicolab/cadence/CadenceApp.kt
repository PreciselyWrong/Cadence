package ch.nicolab.cadence

import android.app.Application
import ch.nicolab.cadence.data.local.AppDatabaseFactory
import ch.nicolab.cadence.data.local.CadenceRepository
import ch.nicolab.cadence.data.local.LearnedQuestionRepository
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.reminder.ReminderScheduler
import ch.nicolab.cadence.tasks.sync.TasksBackground
import ch.nicolab.cadence.tasks.TasksGraph
import ch.nicolab.cadence.tasks.widget.TasksWidgetsAndReminders
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import ch.nicolab.cadence.reminder.AbstinenceMilestoneScheduler
import ch.nicolab.cadence.reminder.AlcoholFollowUpScheduler
import ch.nicolab.cadence.reminder.LearnedQuestionScheduler
import ch.nicolab.cadence.widget.CadenceWidget
import ch.nicolab.cadence.widget.WidgetAutoRefresh
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class CadenceApp : Application() {
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val database by lazy { AppDatabaseFactory.create(this) }
    val repository by lazy { CadenceRepository(database) }
    val learnedQuestions by lazy { LearnedQuestionRepository(database, repository) }

    override fun onCreate() {
        super.onCreate()
        ReminderScheduler.createChannel(this)
        AbstinenceMilestoneScheduler.createChannel(this)
        AlcoholFollowUpScheduler.createChannel(this)
        LearnedQuestionScheduler.createChannel(this)
        applicationScope.launch {
            AbstinenceMilestoneScheduler.scheduleAll(this@CadenceApp, repository)
            AlcoholFollowUpScheduler.scheduleAll(this@CadenceApp, repository)
            LearnedQuestionScheduler.scheduleAll(this@CadenceApp, learnedQuestions)
        }
        // Le widget suit la base plutôt que les appelants : tout changement s'y voit.
        WidgetAutoRefresh(repository.observeWidgetRevisions()) {
            CadenceWidget().updateAll(this)
            ch.nicolab.cadence.widget.today.TodayWidget().updateAll(this)
        }.start(applicationScope)
        // Tâches Tududi : synchronisation, widgets et rappels suivent leur propre base.
        TasksBackground.start(this)
        TasksWidgetsAndReminders.start(this, applicationScope)
        applicationScope.launch {
            TasksGraph.repository(this@CadenceApp).observeTasks()
                .distinctUntilChanged()
                .debounce(100)
                .collect { ch.nicolab.cadence.widget.today.TodayWidget().updateAll(this@CadenceApp) }
        }
    }
}
