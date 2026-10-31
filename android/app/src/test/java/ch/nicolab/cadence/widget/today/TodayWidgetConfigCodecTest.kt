package ch.nicolab.cadence.widget.today

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TodayWidgetConfigCodecTest {

    @Test
    fun `une configuration survit a un aller-retour`() {
        val config = TodayWidgetConfig(
            background = TodayBackground.SOMBRE,
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
            showOverdueSection = false,
            checkFromWidget = false,
            projectRail = false,
            showEvents = true,
            textSize = TodayTextSize.L,
            cornerRadiusDp = 8,
            projectUids = setOf("p-1", "p-2"),
            tagUids = setOf("t-1"),
        )

        val stored = TodayWidgetConfigCodec.encode(config)

        assertEquals(config, TodayWidgetConfigCodec.decode(stored::get))
    }

    @Test
    fun `des valeurs absentes ou abimees donnent les valeurs par defaut`() {
        val defaults = TodayWidgetConfig()
        val junk = setOf("n'importe quoi")

        assertEquals(defaults, TodayWidgetConfigCodec.decode { null })
        // Les identifiants d'habitude sont opaques : une valeur inconnue est gardée telle quelle,
        // elle ne correspond à aucune habitude et n'affiche rien.
        assertEquals(
            defaults.copy(habitIds = junk, projectUids = junk, tagUids = junk),
            TodayWidgetConfigCodec.decode { "n'importe quoi" },
        )
    }

    @Test
    fun `les nombres hors plage sont ramenes dans leur plage`() {
        val stored = TodayWidgetConfigCodec.encode(TodayWidgetConfig())
            .plus(
                mapOf(
                    "maxFacets" to "0",
                    "cornerRadius" to "-5",
                ),
            )

        val config = TodayWidgetConfigCodec.decode(stored::get)

        assertEquals(1, config.maxFacets)
        assertEquals(0, config.cornerRadiusDp)
    }

    @Test
    fun `un ancien fond flou donne le fond plein par defaut`() {
        val stored = TodayWidgetConfigCodec.encode(TodayWidgetConfig()) + mapOf("background" to "FLOU")

        assertEquals(TodayWidgetConfig().background, TodayWidgetConfigCodec.decode(stored::get).background)
    }

    @Test
    fun `un ancien fond verre devient le fond sombre plein`() {
        val stored = TodayWidgetConfigCodec.encode(TodayWidgetConfig()) + mapOf("background" to "VERRE")

        assertEquals(TodayBackground.SOMBRE, TodayWidgetConfigCodec.decode(stored::get).background)
    }

    @Test
    fun `les anciens reglages d'intensite, de voile et de lignes max sont ignores`() {
        val stored = TodayWidgetConfigCodec.encode(TodayWidgetConfig()) +
            mapOf("background" to "FLOU", "intensity" to "32", "veil" to "14", "maxRows" to "6", "taskScope" to "TODAY")

        val config = TodayWidgetConfigCodec.decode(stored::get)

        assertEquals(TodayWidgetConfig(taskScope = TaskScope.TODAY), config)
    }
}
