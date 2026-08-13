package ch.nicolab.cadence.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import ch.nicolab.cadence.R

private val PlusJakartaSans = FontFamily(
    Font(R.font.plus_jakarta_sans, FontWeight.Normal),
    Font(R.font.plus_jakarta_sans, FontWeight.Medium),
    Font(R.font.plus_jakarta_sans, FontWeight.SemiBold),
    Font(R.font.plus_jakarta_sans, FontWeight.Bold),
)

/**
 * Cinq rôles seulement : display, heading, body, secondary, caption.
 * Les emplacements Material restants pointent vers l'un de ces cinq rôles afin qu'aucun
 * écran ne puisse introduire une taille intermédiaire de plus.
 */
private val Display = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 38.sp, letterSpacing = (-0.6).sp)
private val Heading = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.3).sp)
private val Subheading = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 23.sp, letterSpacing = (-0.1).sp)
private val Body = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp)
private val Secondary = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)
private val Caption = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.1.sp)
private val LabelStrong = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 18.sp)

/** Chiffre dominant d'une métrique : nettement plus grand que son libellé. */
val MetricStyle = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 32.sp, letterSpacing = (-0.8).sp)

val Typography = Typography(
    displayLarge = Display,
    displayMedium = Display,
    displaySmall = Display,
    headlineLarge = Display,
    headlineMedium = Display,
    headlineSmall = Heading,
    titleLarge = Heading,
    titleMedium = Subheading,
    titleSmall = LabelStrong,
    bodyLarge = Body,
    bodyMedium = Body,
    bodySmall = Secondary,
    labelLarge = LabelStrong,
    labelMedium = Caption,
    labelSmall = Caption,
)
