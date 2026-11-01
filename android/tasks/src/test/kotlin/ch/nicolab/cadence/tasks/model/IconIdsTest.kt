package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class IconIdsTest {
    @Test
    fun `kebab-case ids of the shared set are valid`() {
        listOf("home", "smoke-free", "sports-gymnastics", "a1-b2").forEach { assertTrue(IconIds.isValid(it), it) }
    }

    @Test
    fun `null and empty clear the icon`() {
        assertTrue(IconIds.isValid(null))
        assertTrue(IconIds.isValid(""))
        assertNull(IconIds.normalize(""))
        assertNull(IconIds.normalize(null))
        assertEquals("home", IconIds.normalize("home"))
    }

    @Test
    fun `ids the server would refuse are invalid`() {
        listOf("Home", "two words", "-home", "home-", "a--b", "é", " ", "x".repeat(41)).forEach { assertFalse(IconIds.isValid(it), it) }
    }
}
