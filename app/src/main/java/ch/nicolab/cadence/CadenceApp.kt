package ch.nicolab.cadence

import android.app.Application
import ch.nicolab.cadence.data.local.AppDatabaseFactory
import ch.nicolab.cadence.data.local.CadenceRepository
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.reminder.ReminderScheduler
import ch.nicolab.cadence.reminder.AbstinenceMilestoneScheduler
import ch.nicolab.cadence.reminder.AlcoholFollowUpScheduler
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

    override fun onCreate() {
        super.onCreate()
        ReminderScheduler.createChannel(this)
        AbstinenceMilestoneScheduler.createChannel(this)
        AlcoholFollowUpScheduler.createChannel(this)
        applicationScope.launch {
            AbstinenceMilestoneScheduler.scheduleAll(this@CadenceApp, repository)
            AlcoholFollowUpScheduler.scheduleAll(this@CadenceApp, repository)
        }
        // Le widget suit la base plutôt que les appelants : tout changement s'y voit.
        WidgetAutoRefresh(repository.observeWidgetRevisions()) {
            CadenceWidget().updateAll(this)
        }.start(applicationScope)
    }
}
