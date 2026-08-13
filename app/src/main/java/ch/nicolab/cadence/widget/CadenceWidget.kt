package ch.nicolab.cadence.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.VectorGroup
import androidx.compose.ui.graphics.vector.VectorPath
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.width
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.text.TextAlign
import ch.nicolab.cadence.CadenceApp
import ch.nicolab.cadence.QuickEntryActivity
import ch.nicolab.cadence.MainActivity
import ch.nicolab.cadence.R
import ch.nicolab.cadence.data.local.entities.WidgetConfigurationEntity
import ch.nicolab.cadence.data.local.model.PersistedHabit
import ch.nicolab.cadence.domain.HabitEvaluation
import ch.nicolab.cadence.domain.HabitEvaluator
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.WidgetGroupMode
import ch.nicolab.cadence.domain.WidgetGroupSelection
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.ui.widget.WidgetCapacityCalculator
import ch.nicolab.cadence.ui.widget.WidgetLayoutCalculator
import ch.nicolab.cadence.ui.widget.WidgetRenderStyle
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.flow.first

private data class WidgetHabit(val habit: PersistedHabit, val evaluation: HabitEvaluation)

class CadenceWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(
        setOf(140, 220, 320).flatMap { width ->
            setOf(48, 76, 104).map { height -> DpSize(width.dp, height.dp) }
        }.toSet(),
    )

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
        val chosen = if (config.selectAll || selected.isEmpty()) allPending else allPending.filter { it.habit.id in selected }
        // Le groupe filtre en dernier : une habitude terminée, sautée ou en pause a déjà
        // disparu, et le mode automatique suit l'heure de rendu.
        val visibleGroupIds = WidgetGroupSelection.visibleGroupIds(
            mode = WidgetGroupMode.fromStorage(config.groupMode),
            groups = repository.getGroups(),
            selectedGroupId = config.groupId,
            time = LocalTime.now(),
        )
        val pending = visibleGroupIds?.let { ids -> chosen.filter { it.habit.groupId in ids } } ?: chosen
        val iconBitmaps = pending.associate { item ->
            // Le monochrome emprunte l'encre du style : elle reste lisible sur son fond.
            val ink = WidgetRenderStyle.byId(config.theme).contentArgb
            val color = if (config.monochromeIcons) ink else item.habit.colorArgb ?: ink
            item.habit.id to renderIcon(item.habit.iconId, color, config.iconSizeDp, config.iconOpacity, config.iconSaturation)
        }
        provideContent { WidgetLine(pending, config, iconBitmaps) }
    }
}

@Composable
private fun WidgetLine(habits: List<WidgetHabit>, config: WidgetConfigurationEntity, iconBitmaps: Map<String, Bitmap>) {
    val style = WidgetRenderStyle.byId(config.theme)
    val isMono = style.isLight
    val alpha = config.opacity.coerceIn(0, 100) / 100f
    val surface = Color(style.surfaceArgb).copy(alpha = alpha)
    val content = Color(style.contentArgb)
    val badge = Color(style.badgeArgb).copy(alpha = style.badgeAlpha)
    val capacity = WidgetCapacityCalculator.calculateCapacity(
        LocalSize.current.width.value.toInt(),
        config.iconSizeDp,
        habits.size,
        config.maxHabitsPerRow,
    )
    val configuredCount = habits.size.coerceAtMost(config.maxHabitsPerRow.coerceIn(1, 6))
    val spaceOverflow = capacity < configuredCount && capacity > 1
    val visibleHabitCount = if (spaceOverflow) capacity - 1 else capacity
    val cellWidthDp = (LocalSize.current.width.value - 20f) / capacity.coerceAtLeast(1)
    val textVisibility = WidgetLayoutCalculator.resolve(
        LocalSize.current.height.value.toInt(),
        config.iconSizeDp,
        config.showLabels,
        config.showValues,
        config.labelTextSizeSp,
        config.valueTextSizeSp,
    )
    val labelColor = content.copy(alpha = config.labelOpacity.coerceIn(0, 100) / 100f)
    val valueColor = content.copy(alpha = config.valueOpacity.coerceIn(0, 100) / 100f)
    Box(
        modifier = GlanceModifier.fillMaxSize().background(ColorProvider(day = surface, night = surface)).cornerRadius(style.cornerRadiusDp.dp).clickable(actionStartActivity<MainActivity>()),
    ) {
    Row(
        modifier = GlanceModifier.fillMaxSize().padding(horizontal = 10.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
        horizontalAlignment = Alignment.Horizontal.CenterHorizontally,
    ) {
        if (habits.isEmpty()) {
            if (config.showDoneIndicator) Image(ImageProvider(if (isMono) R.drawable.ic_widget_mark else R.drawable.ic_widget_mark_light), "À jour", modifier = GlanceModifier.size(24.dp))
        } else {
            habits.take(visibleHabitCount).forEach { item ->
                Column(modifier = GlanceModifier.width(cellWidthDp.dp).clickable(actionStartActivity<QuickEntryActivity>(actionParametersOf(habitIdKey to item.habit.id))), horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                    Box(modifier = GlanceModifier.size((config.iconSizeDp + 8).dp).background(ColorProvider(day = badge, night = badge)).cornerRadius(((config.iconSizeDp + 8) / 2).dp), contentAlignment = Alignment.Center) {
                        iconBitmaps[item.habit.id]?.let { bitmap -> Image(ImageProvider(bitmap), item.habit.name, modifier = GlanceModifier.size(config.iconSizeDp.dp), contentScale = ContentScale.Fit) }
                    }
                    if (textVisibility.showLabels) Text(item.habit.name, maxLines = 1, style = TextStyle(color = ColorProvider(day = labelColor, night = labelColor), fontSize = config.labelTextSizeSp.sp, textAlign = TextAlign.Center), modifier = GlanceModifier.fillMaxWidth().padding(top = 2.dp))
                    if (textVisibility.showValues) Text(HabitFormatter.formatCompactProgress(item.evaluation.progressMinor, item.habit.goal.targetMinor, item.habit.goal.goalType, item.habit.goal.unit), maxLines = 1, style = TextStyle(color = ColorProvider(day = valueColor, night = valueColor), fontSize = config.valueTextSizeSp.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center), modifier = GlanceModifier.fillMaxWidth().padding(top = 2.dp))
                }
            }
            if (spaceOverflow) {
                Box(GlanceModifier.width(cellWidthDp.dp), contentAlignment = Alignment.Center) {
                    Text("+${configuredCount - visibleHabitCount}", style = TextStyle(color = ColorProvider(day = content, night = content), fontWeight = FontWeight.Medium, textAlign = TextAlign.Center))
                }
            }
        }
    }
    }
}

private val habitIdKey = ActionParameters.Key<String>(QuickEntryActivity.EXTRA_HABIT_ID)

private fun renderIcon(iconId: String?, argb: Int, sizeDp: Int, opacity: Int, saturation: Int): Bitmap {
    val vector = HabitIconRegistry.getIcon(iconId).imageVector
    val pixels = (sizeDp.coerceIn(24, 48) * 2).coerceAtLeast(48)
    val bitmap = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = argb
        alpha = (opacity.coerceIn(0, 100) * 255 / 100)
        colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(saturation.coerceIn(0, 100) / 100f) })
        style = Paint.Style.FILL
    }
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
