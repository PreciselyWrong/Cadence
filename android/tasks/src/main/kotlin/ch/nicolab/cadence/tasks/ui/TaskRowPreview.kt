package ch.nicolab.cadence.tasks.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import ch.nicolab.cadence.tasks.model.TaskItem
import ch.nicolab.cadence.tasks.model.TaskPriority
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Preview(showBackground = true)
@Composable
private fun TaskRowPreview() {
    TaskRow(
        task = TaskItem(
            uid = "preview",
            name = "Relire le rapport trimestriel",
            priority = TaskPriority.HIGH,
            dueDate = Instant.parse("2026-10-30T00:00:00Z"),
            dueDay = LocalDate.of(2026, 10, 30),
            recurrenceType = "weekly",
            pendingSync = true,
        ),
        projectName = "Maison",
        today = LocalDate.of(2026, 10, 30),
        zone = ZoneOffset.UTC,
        onToggle = {},
        onOpen = {},
        onSwipeAction = {},
    )
}
