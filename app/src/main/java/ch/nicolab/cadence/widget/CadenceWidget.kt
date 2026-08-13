package ch.nicolab.cadence.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.MainActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.PeriodCalculator
import java.time.LocalDate
import kotlinx.coroutines.flow.first

class CadenceWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(180.dp, 56.dp), DpSize(320.dp, 56.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = (context.applicationContext as CadenceApp).repository
        val today = LocalDate.now()
        val evaluator = HabitEvaluator()
        val pending = repository.observeHabits().first().filter { habit ->
            val window = PeriodCalculator.window(today, habit.goal.period, habit.schedule.firstDayOfWeek)
            val entries = repository.observeEntries(habit.id, window.start, window.endExclusive.minusDays(1)).first()
            val pauses = repository.observePauses(habit.id).first()
            evaluator.evaluate(habit.definition, today, entries, pauses).requiresAction
        }
        provideContent { WidgetLine(pending) }
    }
}

@Composable
private fun WidgetLine(habits: List<PersistedHabit>) {
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp).clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        if (habits.isEmpty()) {
            Image(ImageProvider(R.drawable.ic_widget_mark), "Toutes les habitudes prévues sont terminées", modifier = GlanceModifier.size(26.dp))
        } else {
            habits.take(4).forEach { habit ->
                Box(modifier = GlanceModifier.size(42.dp).padding(4.dp), contentAlignment = Alignment.Center) {
                    Image(ImageProvider(R.drawable.ic_widget_mark), habit.name, modifier = GlanceModifier.size(30.dp), contentScale = ContentScale.Fit)
                }
            }
            if (habits.size > 4) Text("+${habits.size - 4}", style = TextStyle(fontWeight = FontWeight.Medium))
        }
    }
}

class CadenceWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CadenceWidget()
}
