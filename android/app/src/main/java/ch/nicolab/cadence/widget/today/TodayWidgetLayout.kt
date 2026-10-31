package ch.nicolab.cadence.widget.today

import kotlin.math.max

/**
 * Hauteurs du widget. L'en-tête et les habitudes ont une hauteur propre et sont toujours
 * posés ; la liste de tâches, qui défile, prend exactement ce qui reste. Rien ici n'estime un
 * nombre de lignes : la liste montre toutes les tâches et le lanceur les fait défiler.
 */
object TodayWidgetLayout {
    /**
     * Hauteur minimale que le lanceur laisse au widget (`minResizeHeight` de `today_widget_info.xml`).
     * Elle garde l'en-tête et les habitudes entiers pour les trois tailles de texte.
     */
    const val MIN_HEIGHT_DP = 140f

    private const val CONTENT_PADDING_DP = 24f
    private const val HEADER_MIN_DP = 30f
    private const val HEADER_GAP_DP = 6f
    private const val ROW_PADDING_DP = 6f
    private const val CHECK_DP = 22f
    private const val FACET_DP = 32f
    private const val HABITS_GAP_DP = 6f
    private const val LINE_HEIGHT_RATIO = 1.3f

    private fun rowHeightDp(sizes: TodayTextSizes): Float = max(CHECK_DP, sizes.body * LINE_HEIGHT_RATIO) + ROW_PADDING_DP

    /** Hauteur prise par le cadre, l'en-tête et, s'il y en a, la rangée d'habitudes (icône, nom, valeur). */
    fun reservedHeightDp(sizes: TodayTextSizes, habitsShown: Boolean): Float {
        val header = max(HEADER_MIN_DP, sizes.title * LINE_HEIGHT_RATIO) + HEADER_GAP_DP
        val habits = if (habitsShown) HABITS_GAP_DP + FACET_DP + 2 * sizes.small * LINE_HEIGHT_RATIO else 0f
        return CONTENT_PADDING_DP + header + habits
    }

    /** Hauteur laissée à la liste une fois le reste posé, jamais négative. */
    fun listHeightDp(heightDp: Float, sizes: TodayTextSizes, habitsShown: Boolean): Float =
        max(0f, heightDp - reservedHeightDp(sizes, habitsShown))

    /** Vrai quand la liste a au moins la place d'une ligne ; sinon on ne la pose pas. */
    fun listFits(heightDp: Float, sizes: TodayTextSizes, habitsShown: Boolean): Boolean =
        listHeightDp(heightDp, sizes, habitsShown) >= rowHeightDp(sizes)
}
