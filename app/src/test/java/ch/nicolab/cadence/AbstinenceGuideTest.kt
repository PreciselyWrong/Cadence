package ch.nicolab.cadence

import ch.nicolab.cadence.domain.AbstinenceProfile
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AbstinenceGuideTest {
    @Test fun `smoking landmarks retain approximate ranges at their opening thresholds`() {
        val milestones = AbstinenceGuide.milestones(AbstinenceProfile.SMOKING)
        assertEquals(listOf(2L, 3L, 14L, 90L, 365L), milestones.map { it.days })
        milestones.forEach {
            assertTrue(it.scientific)
            assertFalse(it.reached(it.days - 1))
            assertTrue(it.reached(it.days))
            assertTrue(it.sources.isNotEmpty())
        }
        assertTrue(milestones.filter { it.days >= 14 }.all { it.timeLabel != null })
    }

    @Test fun `vaping and other personal profiles never inherit smoking recovery claims`() {
        listOf(AbstinenceProfile.VAPING, AbstinenceProfile.CANNABIS, AbstinenceProfile.CAFFEINE, AbstinenceProfile.CUSTOM).forEach { profile ->
            val milestones = AbstinenceGuide.milestones(profile)
            assertEquals(listOf(7L, 14L, 30L, 90L), milestones.map { it.days })
            assertTrue(milestones.none { it.scientific })
            assertTrue(milestones.all { it.sources.isEmpty() && it.timeLabel == null })
        }
        assertEquals(listOf("https://www.cdc.gov/tobacco/e-cigarettes/quitting.html"), AbstinenceGuide.content(AbstinenceProfile.VAPING).sources.map { it.url })
    }

    @Test fun `each profile has onboarding content and sources stay https`() {
        AbstinenceProfile.entries.forEach { profile ->
            val content = AbstinenceGuide.content(profile)
            assertTrue(content.label != 0 && content.defaultName != 0 && content.description != 0 && content.tip != 0)
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
        val milestone = AbstinenceGuide.milestones(AbstinenceProfile.ALCOHOL).single { it.scientific }
        assertEquals(30L, milestone.days)
        assertFalse(milestone.reached(29))
        assertTrue(milestone.reached(30))
        assertTrue(milestone.sources.all { it.url.startsWith("https://") })
    }

    @Test fun `masturbation has personal landmarks without physiological promises`() {
        val milestones = AbstinenceGuide.milestones(AbstinenceProfile.MASTURBATION)
        assertEquals(listOf(7L, 14L, 30L, 90L), milestones.map { it.days })
        assertTrue(milestones.none { it.scientific })
        assertTrue(milestones.none { it.sources.any { source -> source.url.contains("PMC5942469") } })
    }

    @Test fun `ordinary habits have no abstinence milestones`() {
        assertTrue(AbstinenceGuide.milestones(AbstinenceProfile.NONE).isEmpty())
    }
}
