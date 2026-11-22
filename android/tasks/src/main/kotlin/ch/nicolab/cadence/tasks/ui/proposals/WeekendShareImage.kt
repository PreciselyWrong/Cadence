package ch.nicolab.cadence.tasks.ui.proposals

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import ch.nicolab.cadence.tasks.R
import ch.nicolab.cadence.tasks.proposals.ShareDay
import ch.nicolab.cadence.tasks.proposals.ShareItem
import ch.nicolab.cadence.tasks.proposals.ShareItemState
import ch.nicolab.cadence.tasks.proposals.WeekendModel
import ch.nicolab.cadence.tasks.proposals.WeekendOp
import ch.nicolab.cadence.tasks.proposals.WeekendPart
import ch.nicolab.cadence.tasks.proposals.WeekendProposal
import ch.nicolab.cadence.tasks.proposals.WeekendWeather
import ch.nicolab.cadence.tasks.ui.tasksLocale
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Fabrique l'image PNG 1080 px d'un week-end (`docs/48-weekend.md`, « Share ») hors du thread principal,
 * l'enregistre dans `cacheDir/shared/` et ouvre la feuille de partage système.
 */
internal object WeekendShareImage {
    private const val WIDTH = 1080
    private const val MARGIN_X = 64f
    private const val TOP_PADDING = 72f
    private const val BOTTOM_PADDING = 56f
    private const val CARD_PADDING = 40f
    private const val CARD_RADIUS = 36f
    private const val CARD_GAP = 28f
    private const val ITEM_GAP = 24f
    private const val PILL_PAD_H = 18f
    private const val PILL_PAD_V = 7f

    private val cardDateFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM", tasksLocale)

    suspend fun share(context: Context, proposal: WeekendProposal, picks: Map<String, WeekendOp>) {
        val days = WeekendModel.shareDays(proposal, picks)
        val firstDay = days.firstOrNull()?.date ?: proposal.days.firstOrNull()?.date ?: LocalDate.now()
        val file = withContext(Dispatchers.Default) {
            val bitmap = render(context, proposal, days)
            try {
                withContext(Dispatchers.IO) {
                    val dir = File(context.cacheDir, "shared").apply { mkdirs() }
                    val out = File(dir, "week-end-$firstDay.png")
                    FileOutputStream(out).use { stream ->
                        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                    }
                    out
                }
            } finally {
                bitmap.recycle()
            }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            // Le sélecteur ne transmet la permission de lecture qu'avec un ClipData.
            clipData = ClipData.newRawUri(null, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, null).apply {
            if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    private fun render(context: Context, proposal: WeekendProposal, days: List<ShareDay>): Bitmap {
        val dominant = WeekendModel.dominantWeather(proposal.days)
        val palette = paletteFor(dominant)
        val textWidth = (WIDTH - 2f * MARGIN_X).toInt()
        val cardInnerWidth = (WIDTH - 2f * MARGIN_X - 2f * CARD_PADDING).toInt()

        val kickerPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.muted
            textSize = 24f
            letterSpacing = 0.18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val headlinePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.text
            textSize = 64f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val subtitlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.muted
            textSize = 34f
        }
        val dayTitlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.text
            textSize = 38f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val weatherPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.muted
            textSize = 32f
        }
        val partPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.muted
            textSize = 22f
            letterSpacing = 0.08f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val itemTitlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.text
            textSize = 36f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val busyTitlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.muted
            textSize = 34f
        }
        val metaPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.muted
            textSize = 28f
        }
        val pillTextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.text
            textSize = 22f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val footerPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = palette.muted
            textSize = 24f
        }

        val kicker = context.getString(R.string.weekend_share_kicker)
        val headlineLayout = proposal.headline?.let { staticLayout(it, headlinePaint, textWidth) }
        val subtitleLayout = proposal.subtitle?.let { staticLayout(it, subtitlePaint, textWidth) }
        val calendarPillText = context.getString(R.string.weekend_share_calendar_pill)
        val pillTextWidth = pillTextPaint.measureText(calendarPillText)
        val pillHeight = pillTextPaint.fontMetrics.let { it.descent - it.ascent } + 2f * PILL_PAD_V

        val cardBlocks = days.map { day ->
            val dateLabel = day.date.format(cardDateFormat).replaceFirstChar { it.titlecase(tasksLocale) }
            val weatherLabel = buildString {
                day.weather?.let { append(weatherGlyph(it)).append("  ") }
                if (day.min != null && day.max != null) {
                    append("${day.min}° · ${day.max}°")
                }
            }.trim()
            val weatherWidth = if (weatherLabel.isNotEmpty()) weatherPaint.measureText(weatherLabel) + 20f else 0f
            val dateLayout = staticLayout(dateLabel, dayTitlePaint, (cardInnerWidth - weatherWidth.toInt()).coerceAtLeast(100))

            // Les alternatives d'une demi-journée se suivent : son nom une seule fois.
            val itemBlocks = day.items.mapIndexed { index, item ->
                val partLabel = partCaps(context, item.part).takeIf { index == 0 || day.items[index - 1].part != item.part }
                val titleText = if (item.state == ShareItemState.BUSY) {
                    context.getString(R.string.weekend_busy, item.title)
                } else {
                    item.title
                }
                val titleLayout = staticLayout(
                    titleText,
                    if (item.state == ShareItemState.BUSY) busyTitlePaint else itemTitlePaint,
                    cardInnerWidth,
                )
                val metaText = listOfNotNull(item.place, item.start, item.travel)
                    .joinToString(" · ")
                    .takeIf { it.isNotEmpty() }
                val metaLayout = metaText?.let { staticLayout(it, metaPaint, cardInnerWidth) }
                PreparedItem(item, partLabel, titleLayout, metaLayout)
            }
            PreparedCard(dateLayout, weatherLabel, itemBlocks)
        }

        // Mesure de la hauteur totale avant d'allouer le Bitmap.
        var y = TOP_PADDING
        y += lineHeight(kickerPaint) + 18f
        if (headlineLayout != null) {
            y += headlineLayout.height + 14f
        }
        if (subtitleLayout != null) {
            y += subtitleLayout.height + 12f
        }
        y += 32f

        for (card in cardBlocks) {
            var cardH = CARD_PADDING * 2f + card.dateLayout.height
            if (card.items.isNotEmpty()) {
                cardH += 24f
                card.items.forEachIndexed { idx, item ->
                    if (idx > 0) cardH += ITEM_GAP
                    cardH += rowHeight(item, partPaint, pillHeight)
                    cardH += item.titleLayout.height
                    if (item.metaLayout != null) {
                        cardH += 6f + item.metaLayout.height
                    }
                }
            }
            card.height = cardH
            y += cardH + CARD_GAP
        }
        if (cardBlocks.isNotEmpty()) y -= CARD_GAP
        y += 40f + lineHeight(footerPaint) + BOTTOM_PADDING

        val totalHeight = y.toInt().coerceAtLeast(200)
        val bitmap = Bitmap.createBitmap(WIDTH, totalHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgPaint = Paint().apply {
            shader = LinearGradient(
                0f, 0f, 0f, totalHeight.toFloat(),
                palette.top, palette.bottom,
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, 0f, WIDTH.toFloat(), totalHeight.toFloat(), bgPaint)

        val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.card }
        val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.pill }

        var drawY = TOP_PADDING
        drawBaselineText(canvas, kicker, MARGIN_X, drawY, kickerPaint)
        drawY += lineHeight(kickerPaint) + 18f

        if (headlineLayout != null) {
            drawLayout(canvas, headlineLayout, MARGIN_X, drawY)
            drawY += headlineLayout.height + 14f
        }
        if (subtitleLayout != null) {
            drawLayout(canvas, subtitleLayout, MARGIN_X, drawY)
            drawY += subtitleLayout.height + 12f
        }
        drawY += 32f

        for (card in cardBlocks) {
            val rect = RectF(MARGIN_X, drawY, WIDTH - MARGIN_X, drawY + card.height)
            canvas.drawRoundRect(rect, CARD_RADIUS, CARD_RADIUS, cardPaint)

            var innerY = drawY + CARD_PADDING
            val innerX = MARGIN_X + CARD_PADDING
            drawLayout(canvas, card.dateLayout, innerX, innerY)
            if (card.weatherLabel.isNotEmpty()) {
                val wWidth = weatherPaint.measureText(card.weatherLabel)
                val baseline = innerY + (card.dateLayout.height - lineHeight(weatherPaint)) / 2f - weatherPaint.ascent()
                canvas.drawText(card.weatherLabel, WIDTH - MARGIN_X - CARD_PADDING - wWidth, baseline, weatherPaint)
            }
            innerY += card.dateLayout.height

            if (card.items.isNotEmpty()) {
                innerY += 24f
                card.items.forEachIndexed { idx, item ->
                    if (idx > 0) innerY += ITEM_GAP
                    val rowH = rowHeight(item, partPaint, pillHeight)
                    item.partLabel?.let { label ->
                        val partBaseline = innerY + (rowH - 6f - lineHeight(partPaint)) / 2f - partPaint.ascent()
                        canvas.drawText(label, innerX, partBaseline, partPaint)
                    }

                    if (item.item.state == ShareItemState.CALENDAR) {
                        val pillW = pillTextWidth + 2f * PILL_PAD_H
                        val pillLeft = WIDTH - MARGIN_X - CARD_PADDING - pillW
                        val pillRect = RectF(pillLeft, innerY, pillLeft + pillW, innerY + pillHeight)
                        canvas.drawRoundRect(pillRect, pillHeight / 2f, pillHeight / 2f, pillPaint)
                        val pillBaseline = innerY + PILL_PAD_V - pillTextPaint.ascent()
                        canvas.drawText(calendarPillText, pillLeft + PILL_PAD_H, pillBaseline, pillTextPaint)
                    }
                    innerY += rowH

                    drawLayout(canvas, item.titleLayout, innerX, innerY)
                    innerY += item.titleLayout.height

                    if (item.metaLayout != null) {
                        innerY += 6f
                        drawLayout(canvas, item.metaLayout, innerX, innerY)
                        innerY += item.metaLayout.height
                    }
                }
            }
            drawY += card.height + CARD_GAP
        }
        if (cardBlocks.isNotEmpty()) drawY -= CARD_GAP
        drawY += 40f
        drawBaselineText(canvas, context.getString(R.string.weekend_share_footer), MARGIN_X, drawY, footerPaint)

        return bitmap
    }

    private fun staticLayout(text: String, paint: TextPaint, width: Int): StaticLayout =
        StaticLayout.Builder.obtain(text, 0, text.length, paint, width.coerceAtLeast(1))
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(false)
            .build()

    private fun drawLayout(canvas: Canvas, layout: StaticLayout, x: Float, y: Float) {
        canvas.save()
        canvas.translate(x, y)
        layout.draw(canvas)
        canvas.restore()
    }

    private fun drawBaselineText(canvas: Canvas, text: String, x: Float, y: Float, paint: TextPaint) {
        canvas.drawText(text, x, y - paint.ascent(), paint)
    }

    private fun lineHeight(paint: Paint): Float = paint.fontMetrics.let { it.descent - it.ascent }

    // Ligne du nom de la demi-journée et de la pastille « À l'agenda », vide quand il n'y a ni l'un ni l'autre.
    private fun rowHeight(item: PreparedItem, partPaint: TextPaint, pillHeight: Float): Float {
        val part = if (item.partLabel != null) lineHeight(partPaint) else 0f
        val pill = if (item.item.state == ShareItemState.CALENDAR) pillHeight else 0f
        val row = maxOf(part, pill)
        return if (row > 0f) row + 6f else 0f
    }

    private fun partCaps(context: Context, part: WeekendPart): String = when (part) {
        WeekendPart.MORNING -> context.getString(R.string.weekend_part_morning)
        WeekendPart.AFTERNOON -> context.getString(R.string.weekend_part_afternoon)
        WeekendPart.DAY -> context.getString(R.string.weekend_part_day)
    }.uppercase(tasksLocale)

    private fun weatherGlyph(weather: WeekendWeather): String = when (weather) {
        WeekendWeather.SUN -> "☀️"
        WeekendWeather.PARTLY -> "⛅"
        WeekendWeather.CLOUD -> "☁️"
        WeekendWeather.RAIN -> "🌧️"
        WeekendWeather.SNOW -> "❄️"
        WeekendWeather.STORM -> "⛈️"
        WeekendWeather.FOG -> "🌫️"
    }

    private data class SharePalette(
        val top: Int,
        val bottom: Int,
        val text: Int,
        val muted: Int,
        val card: Int,
        val pill: Int,
    )

    private fun paletteFor(weather: WeekendWeather): SharePalette = when (weather) {
        WeekendWeather.SUN, WeekendWeather.PARTLY -> SharePalette(
            top = Color.parseColor("#FFB347"),
            bottom = Color.parseColor("#FF5E62"),
            text = Color.WHITE,
            muted = Color.argb(217, 255, 255, 255),
            card = Color.argb(46, 255, 255, 255),
            pill = Color.argb(64, 255, 255, 255),
        )
        WeekendWeather.RAIN, WeekendWeather.STORM -> SharePalette(
            top = Color.parseColor("#2C5364"),
            bottom = Color.parseColor("#0F2027"),
            text = Color.WHITE,
            muted = Color.argb(217, 255, 255, 255),
            card = Color.argb(46, 255, 255, 255),
            pill = Color.argb(64, 255, 255, 255),
        )
        WeekendWeather.CLOUD, WeekendWeather.FOG -> SharePalette(
            top = Color.parseColor("#8E9EAB"),
            bottom = Color.parseColor("#D7E1EC"),
            text = Color.parseColor("#1B1B1F"),
            muted = Color.argb(185, 27, 27, 31),
            card = Color.argb(140, 255, 255, 255),
            pill = Color.argb(40, 27, 27, 31),
        )
        WeekendWeather.SNOW -> SharePalette(
            top = Color.parseColor("#E0EAFC"),
            bottom = Color.parseColor("#B8CDEB"),
            text = Color.parseColor("#1B1B1F"),
            muted = Color.argb(185, 27, 27, 31),
            card = Color.argb(140, 255, 255, 255),
            pill = Color.argb(40, 27, 27, 31),
        )
    }

    private class PreparedCard(
        val dateLayout: StaticLayout,
        val weatherLabel: String,
        val items: List<PreparedItem>,
        var height: Float = 0f,
    )

    private class PreparedItem(
        val item: ShareItem,
        val partLabel: String?,
        val titleLayout: StaticLayout,
        val metaLayout: StaticLayout?,
    )
}
