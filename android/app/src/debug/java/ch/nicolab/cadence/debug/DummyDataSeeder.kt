package ch.nicolab.cadence.debug

import ch.nicolab.cadence.CadenceApp
import java.time.LocalDate
import java.time.ZoneId

internal object DummyDataSeeder {
    suspend fun seed(app: CadenceApp, today: LocalDate, zone: ZoneId) {
        val data = DummyDataCatalog.create(today, zone)
        data.habits.forEach { app.repository.deleteHabit(it.id) }
        app.repository.ensureDefaultGroups()
        data.habits.forEach { habit ->
            app.repository.addHabit(habit, effectiveFrom = habit.startsOn)
            app.repository.replaceQuickValues(habit.id, data.quickValues.getValue(habit.id))
        }
        data.entries.forEach { app.repository.addEntry(it, source = "DUMMY") }
    }
}
