package ch.nicolab.cadence.domain

import java.time.LocalTime
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class WidgetGroupSelectionTest {

    private val groups = HabitGroup.defaults()

    @Test
    fun `all groups applies no filter`() {
        assertNull(
            WidgetGroupSelection.visibleGroupIds(
                WidgetGroupMode.ALL,
                groups,
                selectedGroupId = "group-morning",
                time = LocalTime.of(9, 0),
            ),
        )
    }

    @Test
    fun `automatic keeps the all day group and the ranges of the moment`() {
        val visible = WidgetGroupSelection.visibleGroupIds(
            WidgetGroupMode.AUTOMATIC,
            groups,
            selectedGroupId = null,
            time = LocalTime.of(9, 0),
        )

        assertEquals(setOf(HabitGroup.ALL_DAY_ID, "group-morning"), visible)
    }

    @Test
    fun `automatic keeps the all day group when no range covers the moment`() {
        val visible = WidgetGroupSelection.visibleGroupIds(
            WidgetGroupMode.AUTOMATIC,
            groups,
            selectedGroupId = null,
            time = LocalTime.of(23, 30),
        )

        assertEquals(setOf(HabitGroup.ALL_DAY_ID), visible)
    }

    @Test
    fun `a single group ignores the current time`() {
        val visible = WidgetGroupSelection.visibleGroupIds(
            WidgetGroupMode.SINGLE,
            groups,
            selectedGroupId = "group-evening",
            time = LocalTime.of(9, 0),
        )

        assertEquals(setOf("group-evening"), visible)
    }

    @Test
    fun `a deleted single group falls back to every group`() {
        assertNull(
            WidgetGroupSelection.visibleGroupIds(
                WidgetGroupMode.SINGLE,
                groups,
                selectedGroupId = "group-removed",
                time = LocalTime.of(9, 0),
            ),
        )
        assertNull(
            WidgetGroupSelection.visibleGroupIds(
                WidgetGroupMode.SINGLE,
                groups,
                selectedGroupId = null,
                time = LocalTime.of(9, 0),
            ),
        )
    }

    @Test
    fun `an unknown stored mode reads as every group`() {
        assertEquals(WidgetGroupMode.ALL, WidgetGroupMode.fromStorage(null))
        assertEquals(WidgetGroupMode.ALL, WidgetGroupMode.fromStorage("LEGACY"))
        assertEquals(WidgetGroupMode.AUTOMATIC, WidgetGroupMode.fromStorage("AUTOMATIC"))
    }
}
