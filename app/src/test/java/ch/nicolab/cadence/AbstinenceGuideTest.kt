package ch.nicolab.cadence

import ch.nicolab.cadence.domain.AbstinenceProfile
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AbstinenceGuideTest {
    @Test fun `each abstinence profile exposes a concrete occurrence action`() {
        val actionable = AbstinenceProfile.entries.filter { it != AbstinenceProfile.NONE }
        assertEquals(actionable.size, actionable.map(AbstinenceGuide::occurrenceAction).distinct().size)
        assertEquals(R.string.abst_occurrence_alcohol, AbstinenceGuide.occurrenceAction(AbstinenceProfile.ALCOHOL))
        assertEquals(R.string.abst_occurrence_smoking, AbstinenceGuide.occurrenceAction(AbstinenceProfile.SMOKING))
    }

    @Test fun `behavioral profiles have distinct guidance and no invented milestones`() {
        val profiles = listOf("GAMBLING", "SOCIAL_MEDIA", "BEDTIME_SCREENS", "IMPULSE_SHOPPING", "PORNOGRAPHY")
            .map(AbstinenceProfile::valueOf)
        assertEquals(5, profiles.map { AbstinenceGuide.content(it).label }.distinct().size)
        profiles.forEach { profile ->
            val content = AbstinenceGuide.content(profile)
            assertNotEquals(AbstinenceGuide.content(AbstinenceProfile.CUSTOM).description, content.description)
            assertNotNull(content.notice)
            assertTrue(AbstinenceGuide.milestones(profile).isEmpty())
        }
    }
    @Test fun `smoking landmarks retain approximate ranges at their opening thresholds`() {
        val milestones = AbstinenceGuide.milestones(AbstinenceProfile.SMOKING)
        assertEquals(listOf(2L, 3L, 14L, 90L, 365L), milestones.map { it.days })
        milestones.forEach {
            assertFalse(it.reached(it.days - 1))
            assertTrue(it.reached(it.days))
            assertTrue(it.sources.isNotEmpty())
        }
        assertTrue(milestones.filter { it.days >= 14 }.all { it.timeLabel != null })
    }

    @Test fun `vaping and other unsupported profiles expose no timed health claims`() {
        listOf(AbstinenceProfile.VAPING, AbstinenceProfile.CANNABIS, AbstinenceProfile.CAFFEINE, AbstinenceProfile.CUSTOM).forEach { profile ->
            assertTrue(AbstinenceGuide.milestones(profile).isEmpty())
        }
        assertEquals(listOf("https://www.cdc.gov/tobacco/e-cigarettes/quitting.html"), AbstinenceGuide.content(AbstinenceProfile.VAPING).sources.map { it.url })
    }

    @Test fun `each profile has onboarding content and sources stay https`() {
        AbstinenceProfile.entries.forEach { profile ->
            val content = AbstinenceGuide.content(profile)
            assertTrue(content.label != 0 && content.defaultName != 0 && content.description != 0)
            val sources = content.sources + AbstinenceGuide.milestones(profile).flatMap { it.sources }
            assertTrue(sources.all { it.label != 0 && it.url.startsWith("https://") })
        }
        val none = AbstinenceGuide.content(AbstinenceProfile.NONE)
        assertEquals(R.string.abstinence_none, none.label)
        assertNull(none.notice)
        assertTrue(none.sources.isEmpty())
        assertTrue(AbstinenceGuide.content(AbstinenceProfile.CUSTOM).sources.isEmpty())
    }

    @Test fun `alcohol biological landmark only becomes reached after thirty completed days`() {
        val milestone = AbstinenceGuide.milestones(AbstinenceProfile.ALCOHOL).single()
        assertEquals(30L, milestone.days)
        assertFalse(milestone.reached(29))
        assertTrue(milestone.reached(30))
        assertTrue(milestone.sources.all { it.url.startsWith("https://") })
    }

    @Test fun `masturbation has no physiological milestone`() {
        assertTrue(AbstinenceGuide.milestones(AbstinenceProfile.MASTURBATION).isEmpty())
    }

    @Test fun `ordinary habits have no abstinence milestones`() {
        assertTrue(AbstinenceGuide.milestones(AbstinenceProfile.NONE).isEmpty())
    }
}
