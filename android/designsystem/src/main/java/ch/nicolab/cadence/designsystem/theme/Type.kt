package ch.nicolab.cadence.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import ch.nicolab.cadence.designsystem.R

// La police embarquée est variable (axe wght 200-800) : sans réglage explicite de l'axe,
// Android rend toutes les graisses avec l'instance par défaut (400).
@OptIn(ExperimentalTextApi::class)
private fun jakarta(weight: FontWeight) = Font(
    R.font.plus_jakarta_sans,
    weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

private val PlusJakartaSans = FontFamily(
    jakarta(FontWeight.Normal),
    jakarta(FontWeight.Medium),
    jakarta(FontWeight.SemiBold),
    jakarta(FontWeight.Bold),
)

/**
 * Rôles typographiques de la refonte. Les emplacements Material pointent vers ces rôles
 * pour qu'aucun écran n'introduise une taille intermédiaire.
 */
private val Display = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.5).sp)
private val Headline = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 32.sp, letterSpacing = (-0.5).sp)
private val Title = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp)
private val TitleMedium = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Bold, fontSize = 16.sp, lineHeight = 22.sp)
private val Body = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp)
private val BodyMedium = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp)
private val Small = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp)
private val Label = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp)
private val LabelMedium = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp)

/** Chiffre dominant d'une métrique : nettement plus grand que son libellé. */
val MetricStyle = TextStyle(fontFamily = PlusJakartaSans, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 36.sp, letterSpacing = (-0.5).sp)

val Typography = Typography(
    displayLarge = Display,
    displayMedium = Display,
    displaySmall = Display,
    headlineLarge = Headline,
    headlineMedium = Headline,
    headlineSmall = Headline,
    titleLarge = Title,
    titleMedium = TitleMedium,
    titleSmall = Label.copy(fontWeight = FontWeight.SemiBold),
    bodyLarge = Body,
    bodyMedium = BodyMedium,
    bodySmall = Small,
    labelLarge = Label,
    labelMedium = LabelMedium,
    labelSmall = LabelMedium,
)
