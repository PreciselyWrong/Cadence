package ch.nicolab.cadence.reminder

import ch.nicolab.cadence.AbstinenceGuide
import ch.nicolab.cadence.domain.AbstinenceProfile
import java.time.Duration
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AbstinenceMilestonePlannerTest {
    private val start = Instant.parse("2026-09-01T08:15:00Z")

    @Test fun `next scientific milestone uses the active run start`() {
        val next = AbstinenceMilestonePlanner.next(AbstinenceProfile.SMOKING, start, start.plus(Duration.ofDays(1)))
        assertEquals(2, next?.milestone?.days)
        assertEquals(start.plus(Duration.ofDays(2)), next?.triggerAt)
    }

    @Test fun `personal milestones never schedule notifications`() {
        assertNull(AbstinenceMilestonePlanner.next(AbstinenceProfile.MASTURBATION, start, start))
    }

    @Test fun `past scientific milestones are not replayed`() {
        val now = start.plus(Duration.ofDays(20))
        val next = AbstinenceMilestonePlanner.next(AbstinenceProfile.SMOKING, start, now)
        assertEquals(90, next?.milestone?.days)
    }

    @Test fun `receiver validation rejects a reset run`() {
        val milestone = AbstinenceGuide.milestones(AbstinenceProfile.SMOKING).first()
        assertEquals(false, AbstinenceMilestonePlanner.isReachedNow(milestone, start.plus(Duration.ofDays(1)), start.plus(Duration.ofDays(2))))
        assertEquals(true, AbstinenceMilestonePlanner.isReachedNow(milestone, start, start.plus(Duration.ofDays(2))))
    }
}
