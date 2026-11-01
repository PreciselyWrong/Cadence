package ch.nicolab.cadence.tasks.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DetailTitleTest {
    @Test
    fun `un titre long prend le style réduit, un titre court garde le grand`() {
        assertTrue(DetailTitle.isLong("Agent Hermes qui prend mes données de santé, et ce qu'il faut en faire vraiment"))
        assertFalse(DetailTitle.isLong("Acheter du pain"))
    }

    @Test
    fun `la limite compte les caractères rognés, pas les espaces autour`() {
        assertFalse(DetailTitle.isLong("   " + "a".repeat(DetailTitle.LONG_FROM_CHARS) + "   "))
        assertTrue(DetailTitle.isLong("a".repeat(DetailTitle.LONG_FROM_CHARS + 1)))
    }
}
