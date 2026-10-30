package ch.nicolab.cadence.tasks.swipe

import java.time.DayOfWeek
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SchedulePresetTest {
    // 2026-10-30 est un vendredi.
    private val friday = LocalDate.of(2026, 10, 30)

    private fun date(preset: SchedulePreset, today: LocalDate, first: DayOfWeek = DayOfWeek.MONDAY) =
        SchedulePreset.dateFor(preset, today, first)

    @Test
    fun `aujourd'hui et demain`() {
        assertEquals(friday, date(SchedulePreset.TODAY, friday))
        assertEquals(friday.plusDays(1), date(SchedulePreset.TOMORROW, friday))
    }

    @Test
    fun `sans date et choisir n'ont pas de jour fixe`() {
        assertEquals(null, date(SchedulePreset.NO_DATE, friday))
        assertEquals(null, date(SchedulePreset.PICK, friday))
    }

    @Test
    fun `ce week-end un vendredi vise le samedi`() {
        assertEquals(LocalDate.of(2026, 10, 31), date(SchedulePreset.WEEKEND, friday))
    }

    @Test
    fun `ce week-end un lundi vise le samedi suivant`() {
        assertEquals(LocalDate.of(2026, 10, 31), date(SchedulePreset.WEEKEND, LocalDate.of(2026, 10, 26)))
    }

    @Test
    fun `ce week-end un samedi vise le dimanche`() {
        assertEquals(LocalDate.of(2026, 11, 1), date(SchedulePreset.WEEKEND, LocalDate.of(2026, 10, 31)))
    }

    @Test
    fun `ce week-end un dimanche vise le week-end suivant`() {
        assertEquals(LocalDate.of(2026, 11, 7), date(SchedulePreset.WEEKEND, LocalDate.of(2026, 11, 1)))
    }

    @Test
    fun `semaine prochaine commence au premier jour de semaine suivant`() {
        assertEquals(LocalDate.of(2026, 11, 2), date(SchedulePreset.NEXT_WEEK, friday, DayOfWeek.MONDAY))
        assertEquals(LocalDate.of(2026, 11, 1), date(SchedulePreset.NEXT_WEEK, friday, DayOfWeek.SUNDAY))
        assertEquals(LocalDate.of(2026, 10, 31), date(SchedulePreset.NEXT_WEEK, friday, DayOfWeek.SATURDAY))
    }

    @Test
    fun `semaine prochaine un lundi saute à lundi en huit`() {
        val monday = LocalDate.of(2026, 10, 26)
        assertEquals(LocalDate.of(2026, 11, 2), date(SchedulePreset.NEXT_WEEK, monday, DayOfWeek.MONDAY))
    }

    @Test
    fun `reporter d'une semaine ajoute sept jours à l'échéance`() {
        assertEquals(LocalDate.of(2026, 11, 13), SchedulePreset.plusOneWeek(LocalDate.of(2026, 11, 6), today = friday))
    }

    @Test
    fun `reporter d'une semaine sans échéance part d'aujourd'hui`() {
        assertEquals(LocalDate.of(2026, 11, 6), SchedulePreset.plusOneWeek(null, today = friday))
    }

    @Test
    fun `reporter d'une semaine une tâche en retard ne reste pas dans le passé`() {
        assertEquals(LocalDate.of(2026, 11, 6), SchedulePreset.plusOneWeek(LocalDate.of(2026, 10, 1), today = friday))
    }
}
