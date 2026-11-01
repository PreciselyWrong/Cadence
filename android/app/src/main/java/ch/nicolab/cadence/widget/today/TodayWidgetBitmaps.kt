package ch.nicolab.cadence.widget.today

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF

private const val CHECK_STROKE_DP = 2f
private const val CHECK_RADIUS_DP = 6f
private const val MAX_CHECK_DENSITY = 3f
private const val CALENDAR_RADIUS_DP = 2.5f

/**
 * Case à cocher du widget : le carré arrondi à contour de l'application (24 dp, rayon 8) à
 * l'échelle de la ligne. Un widget ne peut pas tracer de contour : la case est rendue en image,
 * en blanc, puis teintée à l'affichage.
 */
internal fun renderCheckBox(colorArgb: Int, sizeDp: Int, density: Float): Bitmap {
    val scale = density.coerceAtMost(MAX_CHECK_DENSITY)
    val pixels = (sizeDp * scale).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888)
    val stroke = CHECK_STROKE_DP * scale
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        color = colorArgb
    }
    val half = stroke / 2f
    val radius = CHECK_RADIUS_DP * scale
    Canvas(bitmap).drawRoundRect(RectF(half, half, pixels - half, pixels - half), radius, radius, paint)
    return bitmap
}

/**
 * Case cochée : le même carré arrondi, plein, la coche évidée pour que la teinte appliquée à
 * l'affichage ne la recouvre pas.
 */
internal fun renderCheckBoxDone(sizeDp: Int, density: Float): Bitmap {
    val scale = density.coerceAtMost(MAX_CHECK_DENSITY)
    val pixels = (sizeDp * scale).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    val radius = CHECK_RADIUS_DP * scale
    canvas.drawRoundRect(RectF(0f, 0f, pixels.toFloat(), pixels.toFloat()), radius, radius, paint)
    clearCheck(canvas, pixels, CHECK_STROKE_DP * scale, paint)
    return bitmap
}

/**
 * Marque d'un événement : l'icône d'agenda, celle de l'application (agenda ; fait, agenda coché).
 * Un widget ne trace pas de contour : elle est rendue en blanc puis teintée à l'affichage. Fait, le
 * corps est plein et la coche évidée, pour que la teinte de l'agenda ne la recouvre pas.
 */
internal fun renderEventMark(done: Boolean, sizeDp: Int, density: Float): Bitmap {
    val scale = density.coerceAtMost(MAX_CHECK_DENSITY)
    val pixels = (sizeDp * scale).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val size = pixels.toFloat()
    val stroke = CHECK_STROKE_DP * scale
    val radius = CALENDAR_RADIUS_DP * scale
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = stroke
        strokeCap = Paint.Cap.ROUND
    }
    for (x in listOf(size * 0.32f, size * 0.68f)) {
        canvas.drawLine(x, size * 0.06f, x, size * 0.26f, paint)
    }
    if (done) {
        paint.style = Paint.Style.FILL
        canvas.drawRoundRect(RectF(0f, size * 0.2f, size, size), radius, radius, paint)
        clearCheck(canvas, pixels, stroke, paint)
    } else {
        val half = stroke / 2f
        canvas.drawRoundRect(RectF(half, size * 0.2f + half, size - half, size - half), radius, radius, paint)
        canvas.drawLine(half, size * 0.42f, size - half, size * 0.42f, paint)
    }
    return bitmap
}

/** Évide la coche dans la forme pleine déjà dessinée. */
private fun clearCheck(canvas: Canvas, pixels: Int, stroke: Float, paint: Paint) {
    val check = Path().apply {
        moveTo(pixels * 0.28f, pixels * 0.52f)
        lineTo(pixels * 0.44f, pixels * 0.67f)
        lineTo(pixels * 0.72f, pixels * 0.36f)
    }
    paint.apply {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
    }
    canvas.drawPath(check, paint)
}

/**
 * Reflet du verre : blanc à [alpha] en haut à gauche, qui s'efface vers le centre puis remonte à
 * peine en bas à droite. Petit carré étiré sur tout le widget.
 */
internal fun renderGlassSheen(alpha: Float): Bitmap {
    val bitmap = Bitmap.createBitmap(SHEEN_PX, SHEEN_PX, Bitmap.Config.ARGB_8888)
    val white = 0x00FFFFFF
    fun tone(a: Float) = ((a.coerceIn(0f, 1f) * 255).toInt() shl 24) or white
    val paint = Paint().apply {
        shader = android.graphics.LinearGradient(
            0f, 0f, SHEEN_PX.toFloat(), SHEEN_PX.toFloat(),
            intArrayOf(tone(alpha), tone(alpha * 0.25f), tone(0f), tone(alpha * 0.2f)),
            floatArrayOf(0f, 0.35f, 0.6f, 1f),
            android.graphics.Shader.TileMode.CLAMP,
        )
    }
    Canvas(bitmap).drawRect(0f, 0f, SHEEN_PX.toFloat(), SHEEN_PX.toFloat(), paint)
    return bitmap
}

private const val SHEEN_PX = 96
