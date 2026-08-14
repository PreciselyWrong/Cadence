package ch.nicolab.cadence

import android.app.Application
import ch.nicolab.cadence.data.local.AppDatabaseFactory
import ch.nicolab.cadence.data.local.CadenceRepository
import androidx.glance.appwidget.updateAll
import ch.nicolab.cadence.reminder.ReminderScheduler
import ch.nicolab.cadence.widget.CadenceWidget
import ch.nicolab.cadence.widget.WidgetAutoRefresh
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class CadenceApp : Application() {
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val database by lazy { AppDatabaseFactory.create(this) }
    val repository by lazy { CadenceRepository(database) }

    override fun onCreate() {
        super.onCreate()
        ReminderScheduler.createChannel(this)
        // Le widget suit la base plutôt que les appelants : tout changement s'y voit.
        WidgetAutoRefresh(repository.observeWidgetRevisions()) {
            CadenceWidget().updateAll(this)
        }.start(applicationScope)
    }
}
