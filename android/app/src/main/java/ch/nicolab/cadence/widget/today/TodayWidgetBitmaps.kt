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
 * Marque d'un événement : un anneau, rond pour se distinguer de la case carrée d'une tâche
 * (comme dans la liste Tâches). Fait, c'est un disque plein dont la coche est évidée, pour que
 * la teinte de l'agenda appliquée à l'affichage ne recouvre pas la coche.
 */
internal fun renderEventMark(done: Boolean, sizeDp: Int, density: Float): Bitmap {
    val scale = density.coerceAtMost(MAX_CHECK_DENSITY)
    val pixels = (sizeDp * scale).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val stroke = CHECK_STROKE_DP * scale
    val centre = pixels / 2f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    if (!done) {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = stroke
        canvas.drawCircle(centre, centre, centre - stroke / 2f, paint)
        return bitmap
    }
    canvas.drawCircle(centre, centre, centre, paint)
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
    return bitmap
}
