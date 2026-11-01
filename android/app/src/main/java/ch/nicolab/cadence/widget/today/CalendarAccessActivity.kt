package ch.nicolab.cadence.widget.today

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import ch.nicolab.cadence.calendar.CalendarGraph
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.launch

/**
 * Écran de permission ouvert par la ligne « Autoriser l'agenda » du widget « Aujourd'hui » : demande
 * `READ_CALENDAR`, relit les agendas et redessine le widget, puis se ferme.
 */
class CalendarAccessActivity : ComponentActivity() {
    private val request = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        CalendarGraph.repository(this).refresh()
        TodayWidgetReloads.request()
        lifecycleScope.launch {
            TodayWidget().updateAll(applicationContext)
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) request.launch(Manifest.permission.READ_CALENDAR)
    }
}
