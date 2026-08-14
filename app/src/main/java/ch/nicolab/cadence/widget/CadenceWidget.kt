package ch.nicolab.cadence.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
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
import ch.nicolab.cadence.domain.HabitTimer
import ch.nicolab.cadence.domain.PeriodCalculator
import ch.nicolab.cadence.domain.WidgetGroupMode
import ch.nicolab.cadence.domain.WidgetGroupSelection
import ch.nicolab.cadence.ui.HabitFormatter
import ch.nicolab.cadence.ui.icon.HabitIconRegistry
import ch.nicolab.cadence.domain.WidgetSlotAlignment
import ch.nicolab.cadence.domain.WidgetSlotMode
import ch.nicolab.cadence.ui.widget.WidgetLayoutCalculator
import ch.nicolab.cadence.ui.widget.WidgetSlotSolver
import ch.nicolab.cadence.ui.widget.WidgetRenderStyle
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import androidx.glance.appwidget.updateAll

import android.graphics.PointF
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

private data class WidgetHabit(
    val habit: PersistedHabit,
    val evaluation: HabitEvaluation,
    /** Secondes déjà mesurées lorsqu'un chronomètre est actif, nulles sinon. */
    val timerSeconds: Long? = null,
)

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
        val now = Instant.now()
        val timers = repository.getTimers()
        val allPending = repository.getHabitsEffectiveAt(today).mapNotNull { habit ->
            val window = PeriodCalculator.window(today, habit.goal.period, habit.schedule.firstDayOfWeek)
            val entries = repository.getEntries(habit.id, window.start, window.endExclusive.minusDays(1))
            val pauses = repository.getPauses(habit.id)
            evaluator.evaluate(habit.definition, today, entries, pauses).takeIf { it.needsAttentionNow }?.let { evaluation ->
                // Un chronomètre actif s'affiche à la place de la progression : un toucher
                // sur l'habitude ouvre la saisie rapide, qui permet de le reprendre.
                val running = timers[habit.id]?.takeIf(HabitTimer::isRunning)?.elapsedSecondsAt(now)
                WidgetHabit(habit, evaluation, running)
            }
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
        val style = WidgetRenderStyle.byId(config.theme)
        val iconBitmaps = pending.associate { item ->
            // Le monochrome emprunte l'encre du style : elle reste lisible sur son fond.
            val ink = style.contentArgb
            val color = if (config.monochromeIcons) ink else item.habit.colorArgb ?: ink
            val target = item.evaluation.targetMinor.takeIf { it > 0 } ?: 1L
            val progress = (item.evaluation.progressMinor.toFloat() / target).coerceIn(0f, 1f)
            item.habit.id to renderHabitFacet(
                iconId = item.habit.iconId,
                colorArgb = color,
                progress = progress,
                badgeArgb = style.badgeArgb,
                badgeAlpha = style.badgeAlpha,
                iconSizeDp = config.iconSizeDp,
                opacity = config.iconOpacity,
                saturation = config.iconSaturation,
            )
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
    val slotMode = WidgetSlotMode.fromStorage(config.slotMode)
    val layout = WidgetSlotSolver.solve(
        LocalSize.current.width.value.toInt(),
        config.iconSizeDp,
        habits.size,
        config.maxHabitsPerRow,
        slotMode,
    )
    // L'alignement ne se voit qu'en mode fixe : en souple, les emplacements remplissent
    // déjà toute la largeur.
    val rowAlignment = when (WidgetSlotAlignment.fromStorage(config.slotAlignment)) {
        WidgetSlotAlignment.START -> Alignment.Horizontal.Start
        WidgetSlotAlignment.CENTER -> Alignment.Horizontal.CenterHorizontally
        WidgetSlotAlignment.END -> Alignment.Horizontal.End
    }
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
    val badgeSizeDp = config.iconSizeDp + 10
    Box(
        modifier = GlanceModifier.fillMaxSize().background(ColorProvider(day = surface, night = surface)).cornerRadius(style.cornerRadiusDp.dp).clickable(actionStartActivity<MainActivity>()),
    ) {
    Row(
        modifier = GlanceModifier.fillMaxSize().padding(horizontal = 10.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
        horizontalAlignment = if (slotMode == WidgetSlotMode.FIXED) rowAlignment else Alignment.Horizontal.CenterHorizontally,
    ) {
        if (habits.isEmpty()) {
            if (config.showDoneIndicator) Image(ImageProvider(if (isMono) R.drawable.ic_widget_mark else R.drawable.ic_widget_mark_light), "À jour", modifier = GlanceModifier.size(24.dp))
        } else {
            habits.take(layout.visibleCount).forEach { item ->
                Column(modifier = GlanceModifier.width(layout.slotWidthDp.dp).clickable(actionStartActivity<QuickEntryActivity>(actionParametersOf(habitIdKey to item.habit.id))), horizontalAlignment = Alignment.Horizontal.CenterHorizontally) {
                    iconBitmaps[item.habit.id]?.let { bitmap ->
                        Image(
                            ImageProvider(bitmap),
                            item.habit.name,
                            modifier = GlanceModifier.size(badgeSizeDp.dp),
                            contentScale = ContentScale.Fit,
                        )
                    }
                    if (textVisibility.showLabels) Text(item.habit.name, maxLines = 1, style = TextStyle(color = ColorProvider(day = labelColor, night = labelColor), fontSize = config.labelTextSizeSp.sp, textAlign = TextAlign.Center), modifier = GlanceModifier.fillMaxWidth().padding(top = 2.dp))
                    if (textVisibility.showValues) Text(item.timerSeconds?.let { HabitFormatter.formatValue(it, item.habit.goal.goalType, item.habit.goal.unit) } ?: HabitFormatter.formatCompactProgress(item.evaluation.progressMinor, item.evaluation.targetMinor, item.habit.goal.goalType, item.habit.goal.unit), maxLines = 1, style = TextStyle(color = ColorProvider(day = valueColor, night = valueColor), fontSize = config.valueTextSizeSp.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center), modifier = GlanceModifier.fillMaxWidth().padding(top = 2.dp))
                }
            }
            if (layout.showsOverflow) {
                Box(GlanceModifier.width(layout.slotWidthDp.dp), contentAlignment = Alignment.Center) {
                    Text("+${layout.overflowCount}", style = TextStyle(color = ColorProvider(day = content, night = content), fontWeight = FontWeight.Medium, textAlign = TextAlign.Center))
                }
            }
        }
    }
    }
}

private val habitIdKey = ActionParameters.Key<String>(QuickEntryActivity.EXTRA_HABIT_ID)

private fun PointF.moveToward(target: PointF, distance: Float): PointF {
    val length = hypot(target.x - x, target.y - y).coerceAtLeast(0.001f)
    val step = distance.coerceAtMost(length / 2f) / length
    return PointF(x + (target.x - x) * step, y + (target.y - y) * step)
}

private fun facetPath(cx: Float, cy: Float, radius: Float, corner: Float, sides: Int = 6, rotation: Float = -60f): android.graphics.Path {
    val path = android.graphics.Path()
    val points = List(sides) { index ->
        val angle = (rotation + index * 360f / sides) * PI.toFloat() / 180f
        PointF(cx + radius * cos(angle), cy + radius * sin(angle))
    }
    points.forEachIndexed { index, point ->
        val previous = points[(index - 1 + sides) % sides]
        val next = points[(index + 1) % sides]
        val entry = point.moveToward(previous, corner)
        val exit = point.moveToward(next, corner)
        if (index == 0) path.moveTo(entry.x, entry.y) else path.lineTo(entry.x, entry.y)
        path.quadTo(point.x, point.y, exit.x, exit.y)
    }
    path.close()
    return path
}

private fun renderHabitFacet(
    iconId: String?,
    colorArgb: Int,
    progress: Float,
    badgeArgb: Int,
    badgeAlpha: Float,
    iconSizeDp: Int,
    opacity: Int,
    saturation: Int,
): Bitmap {
    val density = 3f
    val badgeSizeDp = iconSizeDp + 10
    val totalPixels = (badgeSizeDp * density).toInt()
    val bitmap = Bitmap.createBitmap(totalPixels, totalPixels, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val strokeWidth = 2.5f * density
    val cx = totalPixels / 2f
    val cy = totalPixels / 2f
    val radius = (totalPixels - strokeWidth) / 2f
    val path = facetPath(cx, cy, radius, radius * 0.12f)

    // Fond du badge
    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = badgeArgb
        alpha = (badgeAlpha.coerceIn(0f, 1f) * 255).toInt()
    }
    canvas.drawPath(path, bgPaint)

    // Teinte subtile de l'habitude
    val tintFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = colorArgb
        alpha = (0.12f * (opacity.coerceIn(0, 100) / 100f) * 255).toInt()
    }
    canvas.drawPath(path, tintFillPaint)

    // Piste de la jauge
    val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        this.strokeWidth = strokeWidth
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = colorArgb
        alpha = (0.22f * 255).toInt()
    }
    canvas.drawPath(path, trackPaint)

    // Progression active
    if (progress > 0f) {
        val measure = android.graphics.PathMeasure(path, false)
        val traced = android.graphics.Path()
        measure.getSegment(0f, measure.length * progress.coerceIn(0f, 1f), traced, true)
        val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            this.strokeWidth = strokeWidth
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            color = colorArgb
            alpha = (opacity.coerceIn(0, 100) * 255 / 100)
            colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(saturation.coerceIn(0, 100) / 100f) })
        }
        canvas.drawPath(traced, progressPaint)
    }

    // Icône centrale
    val vector = HabitIconRegistry.getIcon(iconId).imageVector
    val iconPixels = iconSizeDp * density * 0.9f
    val iconLeft = (totalPixels - iconPixels) / 2f
    val iconTop = (totalPixels - iconPixels) / 2f
    canvas.save()
    canvas.translate(iconLeft, iconTop)
    val scale = iconPixels / vector.viewportWidth
    canvas.scale(scale, scale)

    val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorArgb
        alpha = (opacity.coerceIn(0, 100) * 255 / 100)
        colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(saturation.coerceIn(0, 100) / 100f) })
        style = Paint.Style.FILL
    }
    fun draw(group: VectorGroup) {
        group.forEach { node ->
            when (node) {
                is VectorPath -> canvas.drawPath(PathParser().addPathNodes(node.pathData).toPath().asAndroidPath(), iconPaint)
                is VectorGroup -> draw(node)
            }
        }
    }
    draw(vector.root)
    canvas.restore()

    return bitmap
}

class CadenceWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CadenceWidget()

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            // Le contenu dépend du jour et de l'heure : ces signaux le redessinent
            // immédiatement, puis réarment le prochain basculement.
            WidgetBoundaryAlarm.ACTION_BOUNDARY,
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            -> {
                val pending = goAsync()
                (context.applicationContext as CadenceApp).applicationScope.launch {
                    try {
                        CadenceWidget().updateAll(context)
                        WidgetBoundaryAlarm.arm(context)
                    } finally {
                        pending.finish()
                    }
                }
            }
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, manager, appWidgetIds)
        WidgetBoundaryAlarm.arm(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetBoundaryAlarm.cancel(context)
    }
}
