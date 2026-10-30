package ch.nicolab.cadence.tasks.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class DueDayTest {
    private val utc = ZoneId.of("UTC")
    private val paris = ZoneId.of("Europe/Paris")
    private val zurich = ZoneId.of("Europe/Zurich")

    @Test
    fun `échéance sans heure garde le jour du compte, même si l'appareil est un jour plus loin`() {
        val due = dueDayOf("2026-10-30T23:59:59.999Z", dueHasTime = false, accountZone = utc, deviceZone = paris)

        assertEquals(LocalDate.of(2026, 10, 30), due)
    }

    @Test
    fun `le mappeur donne le jour de l'échéance sans heure à partir du fuseau du compte`() {
        val row = TaskRow(
            task = TaskEntity(
                uid = "tache",
                name = "Payer le loyer",
                note = null,
                status = 0,
                priority = null,
                dueDateRaw = "2026-10-30T23:59:59.999Z",
                dueHasTime = false,
                deferUntilRaw = null,
                reminderAtRaw = null,
                recurrenceType = null,
                projectUid = null,
                areaUid = null,
                parentTaskUid = null,
                tagUidsJson = "[]",
                completedAtRaw = null,
                pinnedAtRaw = null,
                fieldClocksJson = "{}",
                extrasJson = "{}",
            ),
            pendingSync = false,
        )

        assertEquals(LocalDate.of(2026, 10, 30), row.toItem(accountZone = utc, deviceZone = paris).dueDay)
    }

    @Test
    fun `échéance avec heure se lit dans le fuseau de l'appareil`() {
        val due = dueDayOf("2026-10-30T23:30:00Z", dueHasTime = true, accountZone = utc, deviceZone = paris)

        assertEquals(LocalDate.of(2026, 10, 31), due)
    }

    @Test
    fun `échéance sans heure suit le fuseau du compte pour la fin de journée`() {
        val due = dueDayOf("2026-10-30T22:59:59.999Z", dueHasTime = false, accountZone = zurich, deviceZone = paris)

        assertEquals(LocalDate.of(2026, 10, 30), due)
    }

    @Test
    fun `échéance absente ou illisible n'a pas de jour`() {
        assertEquals(null, dueDayOf(null, dueHasTime = false, accountZone = utc, deviceZone = paris))
        assertEquals(null, dueDayOf("pas une date", dueHasTime = false, accountZone = utc, deviceZone = paris))
    }

    @Test
    fun `date seule s'envoie en fin de journée dans le fuseau du compte`() {
        val due = dueInstant(LocalDate.of(2026, 10, 30), time = null, accountZone = utc, deviceZone = paris)

        assertEquals(Instant.parse("2026-10-30T23:59:59.999Z"), due)
    }

    @Test
    fun `date seule suit le fuseau du compte et non celui de l'appareil`() {
        val due = dueInstant(LocalDate.of(2026, 10, 30), time = null, accountZone = zurich, deviceZone = utc)

        assertEquals(Instant.parse("2026-10-30T22:59:59.999Z"), due)
    }

    @Test
    fun `date avec heure s'envoie à cette heure dans le fuseau de l'appareil`() {
        val due = dueInstant(LocalDate.of(2026, 10, 30), time = "15:45", accountZone = utc, deviceZone = paris)

        assertEquals(Instant.parse("2026-10-30T14:45:00Z"), due)
    }
}
