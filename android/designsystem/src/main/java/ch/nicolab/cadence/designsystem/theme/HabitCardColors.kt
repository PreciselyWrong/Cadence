package ch.nicolab.cadence.designsystem.theme

private const val MIN_CONTRAST = 4.5

/**
 * Couleur de la part remplie d'une carte d'habitude : sa teinte, assombrie ou éclaircie juste assez pour que l'encre
 * du thème y reste à 4,5:1. La même encre se lit donc sur la part remplie et sur le reste de la carte.
 */
fun habitFillArgb(tintArgb: Int, inkArgb: Int): Int = readableTint(tintArgb, inkArgb, MIN_CONTRAST)
