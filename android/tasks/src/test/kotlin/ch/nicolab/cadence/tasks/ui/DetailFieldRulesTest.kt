package ch.nicolab.cadence.tasks.ui

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Une tâche simple garde une fiche simple, comme le panneau du web. */
class DetailFieldRulesTest {
    private fun shown(key: DetailFieldKey, filled: Boolean, hasBadge: Boolean = false, showMore: Boolean = false) =
        DetailFieldRules.visible(key, filled = filled, hasBadge = hasBadge, showMore = showMore)

    @Test
    fun `une tache vide montre les dates et le projet, le reste attend Plus`() {
        val visible = DetailFieldKey.entries.filter { shown(it, filled = false) }
        assertEquals(listOf(DetailFieldKey.DATES, DetailFieldKey.PROJECT), visible)
        assertTrue(DetailFieldKey.entries.all { shown(it, filled = false, showMore = true) })
    }

    @Test
    fun `une valeur deja lue sur un badge n'est pas repetee en ligne`() {
        assertFalse(shown(DetailFieldKey.PROJECT, filled = true, hasBadge = true))
        assertFalse(shown(DetailFieldKey.TAGS, filled = true, hasBadge = true, showMore = true))
    }

    @Test
    fun `une valeur sans badge garde sa ligne`() {
        assertTrue(shown(DetailFieldKey.ESTIMATE, filled = true))
        assertTrue(shown(DetailFieldKey.DATES, filled = true, hasBadge = false))
    }

    @Test
    fun `Plus n'est propose que s'il cache quelque chose`() {
        assertTrue(DetailFieldRules.hasHidden(listOf(DetailFieldKey.REPEAT to false), badges = emptySet(), showMore = false))
        assertFalse(DetailFieldRules.hasHidden(listOf(DetailFieldKey.REPEAT to false), badges = emptySet(), showMore = true))
        assertFalse(DetailFieldRules.hasHidden(listOf(DetailFieldKey.DATES to false), badges = emptySet(), showMore = false))
    }
}
