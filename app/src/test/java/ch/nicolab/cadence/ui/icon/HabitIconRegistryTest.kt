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
        assertEquals("stretch", HabitIconRegistry.search("bras en l'air").single().id)
        assertEquals("abs", HabitIconRegistry.search("abdos").single().id)
        assertEquals("toothpaste", HabitIconRegistry.search("dentifrice").single().id)
        assertEquals("cream", HabitIconRegistry.search("crème").single().id)
    }

    @Test
    fun `unknown persisted id resolves to stable fallback`() {
        assertEquals(HabitIconRegistry.DEFAULT_ICON_ID, HabitIconRegistry.getIcon("missing").id)
    }
}
