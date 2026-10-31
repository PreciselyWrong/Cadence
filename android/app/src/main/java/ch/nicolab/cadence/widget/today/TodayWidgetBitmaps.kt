package ch.nicolab.cadence.widget.today

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
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
