package ch.nicolab.cadence.widget.today

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TodayWidgetConfigCodecTest {

    @Test
    fun `une configuration survit a un aller-retour`() {
        val config = TodayWidgetConfig(
            background = TodayBackground.VERRE,
            intensity = 77,
            veil = 5,
            controlColour = ControlColour.LIBRE,
            freeControlArgb = 0xFF123456.toInt(),
            discreteButtons = true,
            showTasks = false,
            habitPlacement = HabitPlacement.ABOVE,
            habitSelection = HabitSelection.CHOOSE,
            habitIds = setOf("h-1", "h-2"),
            maxFacets = 3,
            taskScope = TaskScope.NEXT_7,
            highPriorityOnly = true,
            hideRecurring = true,
            sort = TaskSort.PROJECT,
            maxRows = 9,
            showOverdueSection = false,
            checkFromWidget = false,
            projectRail = false,
            showEvents = true,
            textSize = TodayTextSize.L,
            cornerRadiusDp = 8,
        )

        val stored = TodayWidgetConfigCodec.encode(config)

        assertEquals(config, TodayWidgetConfigCodec.decode(stored::get))
    }

    @Test
    fun `des valeurs absentes ou abimees donnent les valeurs par defaut`() {
        val defaults = TodayWidgetConfig()

        assertEquals(defaults, TodayWidgetConfigCodec.decode { null })
        // Les identifiants d'habitude sont opaques : une valeur inconnue est gardée telle quelle,
        // elle ne correspond à aucune habitude et n'affiche rien.
        assertEquals(
            defaults.copy(habitIds = setOf("n'importe quoi")),
            TodayWidgetConfigCodec.decode { "n'importe quoi" },
        )
    }

    @Test
    fun `les nombres hors plage sont ramenes dans leur plage`() {
        val stored = TodayWidgetConfigCodec.encode(TodayWidgetConfig())
            .plus(
                mapOf(
                    "intensity" to "999",
                    "maxFacets" to "0",
                    "maxRows" to "40",
                    "cornerRadius" to "-5",
                ),
            )

        val config = TodayWidgetConfigCodec.decode(stored::get)

        assertEquals(100, config.intensity)
        assertEquals(1, config.maxFacets)
        assertEquals(12, config.maxRows)
        assertEquals(0, config.cornerRadiusDp)
    }
}
