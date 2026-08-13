package ch.nicolab.cadence.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.VectorGroup
import androidx.compose.ui.graphics.vector.VectorPath
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.widget.WidgetCapacityCalculator
import java.time.LocalDate
import kotlinx.coroutines.flow.first

private data class WidgetHabit(val habit: PersistedHabit, val evaluation: HabitEvaluation)

class CadenceWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(140.dp, 76.dp), DpSize(220.dp, 76.dp), DpSize(320.dp, 76.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = (context.applicationContext as CadenceApp).repository
        val today = LocalDate.now()
        val evaluator = HabitEvaluator()
        val allPending = repository.observeHabits().first().mapNotNull { habit ->
            val window = PeriodCalculator.window(today, habit.goal.period, habit.schedule.firstDayOfWeek)
            val entries = repository.observeEntries(habit.id, window.start, window.endExclusive.minusDays(1)).first()
            val pauses = repository.observePauses(habit.id).first()
            evaluator.evaluate(habit.definition, today, entries, pauses).takeIf { it.needsAttentionNow }?.let { WidgetHabit(habit, it) }
        }
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        val config = repository.getWidgetConfig(appWidgetId) ?: WidgetConfigurationEntity(appWidgetId, null, "HALO")
        val selected = repository.getWidgetHabitIds(appWidgetId).toSet()
        val pending = if (config.selectAll || selected.isEmpty()) allPending else allPending.filter { it.habit.id in selected }
        val iconBitmaps = pending.associate { item -> item.habit.id to renderIcon(item.habit.iconId, item.habit.colorArgb ?: 0xFFF7F8FC.toInt(), config.iconSizeDp) }
        provideContent { WidgetLine(pending, config, iconBitmaps) }
    }
}

@Composable
private fun WidgetLine(habits: List<WidgetHabit>, config: WidgetConfigurationEntity, iconBitmaps: Map<String, Bitmap>) {
    val isMono = config.theme == "MONO"
    val alpha = config.opacity.coerceIn(0, 100) / 100f
    val baseSurface = when (config.theme) { "OCEAN" -> Color(0xFF073B4C); "FOREST" -> Color(0xFF12372A); "AUBERGINE" -> Color(0xFF35155D); "CORAL" -> Color(0xFF6D2932); "MONO" -> Color(0xFFF7F8FC); else -> Color(0xFF171B2E) }
    val surface = baseSurface.copy(alpha = alpha)
    val content = if (isMono) Color(0xFF172033) else Color(0xFFF7F8FC)
    val badge = (if (isMono) Color(0xFFE9EDF5) else Color.White).copy(alpha = if (isMono) .72f else .14f)
    val capacity = WidgetCapacityCalculator.calculateCapacity(LocalSize.current.width.value.toInt(), config.iconSizeDp, config.showValues, habits.size)
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(76.dp).background(ColorProvider(day = surface, night = surface)).cornerRadius(28.dp).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        if (habits.isEmpty()) {
            if (config.showDoneIndicator) Image(ImageProvider(if (isMono) R.drawable.ic_widget_mark else R.drawable.ic_widget_mark_light), "À jour", modifier = GlanceModifier.size(24.dp))
        } else {
            habits.take(capacity).forEach { item ->
                Column(modifier = GlanceModifier.padding(end = 8.dp).clickable(actionStartActivity<QuickEntryActivity>(actionParametersOf(habitIdKey to item.habit.id))), horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                    Box(modifier = GlanceModifier.size((config.iconSizeDp + 8).dp).background(ColorProvider(day = badge, night = badge)).cornerRadius(((config.iconSizeDp + 8) / 2).dp), contentAlignment = Alignment.Center) {
                        iconBitmaps[item.habit.id]?.let { bitmap -> Image(ImageProvider(bitmap), item.habit.name, modifier = GlanceModifier.size(config.iconSizeDp.dp), contentScale = ContentScale.Fit) }
                    }
                    if (config.showValues) Text(HabitFormatter.formatCompactProgress(item.evaluation.progressMinor, item.habit.goal.targetMinor, item.habit.goal.goalType, item.habit.goal.unit), style = TextStyle(color = ColorProvider(day = content, night = content), fontWeight = FontWeight.Medium), modifier = GlanceModifier.padding(top = 2.dp))
                }
            }
            if (habits.size > capacity) Text("+${habits.size - capacity}", style = TextStyle(color = ColorProvider(day = content, night = content), fontWeight = FontWeight.Medium))
        }
    }
}

private val habitIdKey = ActionParameters.Key<String>(QuickEntryActivity.EXTRA_HABIT_ID)

private fun renderIcon(iconId: String?, argb: Int, sizeDp: Int): Bitmap {
    val vector = HabitIconRegistry.getIcon(iconId).imageVector
    val pixels = (sizeDp.coerceIn(24, 48) * 2).coerceAtLeast(48)
    val bitmap = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = argb; style = Paint.Style.FILL }
    val scale = pixels / vector.viewportWidth
    canvas.scale(scale, scale)
    fun draw(group: VectorGroup) {
        group.forEach { node ->
            when (node) {
                is VectorPath -> canvas.drawPath(PathParser().addPathNodes(node.pathData).toPath().asAndroidPath(), paint)
                is VectorGroup -> draw(node)
            }
        }
    }
    draw(vector.root)
    return bitmap
}

class CadenceWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CadenceWidget()
}
