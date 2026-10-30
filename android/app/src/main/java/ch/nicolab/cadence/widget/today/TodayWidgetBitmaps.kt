package ch.nicolab.cadence.widget.today

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader

private const val CHECK_STROKE_DP = 2f
private const val CHECK_RADIUS_DP = 6f
private const val MAX_CHECK_DENSITY = 3f
private const val MAX_FRAME_DENSITY = 2f
private const val RIM_DP = 1f
private const val SHEEN_FRACTION = 0.4f
private const val RIM_ALPHA = 0.26f
private const val SHEEN_ALPHA = 0.10f

/**
 * Case à cocher du widget : le carré arrondi à contour de l'application (24 dp, rayon 8) à
 * l'échelle de la ligne. Un widget ne peut pas tracer de contour : la case est rendue en image.
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
 * Cadre de verre : liseré fin de la couleur d'encre et, sur fond sombre, un reflet léger en haut.
 * Rendu à la taille exacte du widget pour que le liseré garde 1 dp et un rayon juste.
 */
internal fun renderGlassFrame(widthDp: Float, heightDp: Float, radiusDp: Float, density: Float, inkArgb: Int, sheen: Boolean): Bitmap {
    val scale = density.coerceAtMost(MAX_FRAME_DENSITY)
    val width = (widthDp * scale).toInt().coerceAtLeast(2)
    val height = (heightDp * scale).toInt().coerceAtLeast(2)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val radius = radiusDp * scale
    val rim = RIM_DP * scale
    val bounds = RectF(rim / 2f, rim / 2f, width - rim / 2f, height - rim / 2f)
    if (sheen) {
        val shader = LinearGradient(
            0f, 0f, 0f, height * SHEEN_FRACTION,
            withAlpha(inkArgb, SHEEN_ALPHA), withAlpha(inkArgb, 0f), Shader.TileMode.CLAMP,
        )
        canvas.drawRoundRect(bounds, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
    }
    val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = rim
        color = withAlpha(inkArgb, RIM_ALPHA)
    }
    canvas.drawRoundRect(bounds, radius, radius, rimPaint)
    return bitmap
}

private fun withAlpha(argb: Int, alpha: Float): Int = (argb and 0x00FFFFFF) or ((alpha * 255).toInt() shl 24)
