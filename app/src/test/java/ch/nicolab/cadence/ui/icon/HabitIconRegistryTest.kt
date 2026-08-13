package ch.nicolab.cadence.ui.icon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class HabitIconRegistryTest {
    @Test
    fun `stable icon registry is broad and searchable in French and English`() {
        assertTrue(HabitIconRegistry.ICONS.size >= 50)
        assertEquals("run", HabitIconRegistry.search("running").single().id)
        assertEquals("water", HabitIconRegistry.search("eau").single().id)
        assertEquals("coffee", HabitIconRegistry.search("café").single().id)
    }

    @Test
    fun `unknown persisted id resolves to stable fallback`() {
        assertEquals(HabitIconRegistry.DEFAULT_ICON_ID, HabitIconRegistry.getIcon("missing").id)
    }
}
