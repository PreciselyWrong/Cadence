package ch.nicolab.cadence.tasks.quickadd

import ch.nicolab.cadence.tasks.model.TaskPriority
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class QuickAddParserTest {
    // Vendredi 30 octobre 2026, 10:00 à Paris.
    private val zone = ZoneId.of("Europe/Paris")
    private val clock = Clock.fixed(Instant.parse("2026-10-30T09:00:00Z"), zone)
    private val friday = LocalDate.of(2026, 10, 30)

    private val projects = listOf(
        NamedRef("p-home", "Maison"),
        NamedRef("p-admin", "Administratif"),
        NamedRef("p-hermes", "Hermès"),
        NamedRef("p-hobby", "Hobbies"),
        NamedRef("p-hosp", "Hôpital"),
    )
    private val tags = listOf(NamedRef("t-perso", "Perso"), NamedRef("t-ia", "ia"))

    private fun parse(text: String, ignored: Set<String> = emptySet()) =
        QuickAddParser.parse(text, clock, projects, tags, ignored)

    @Test
    fun `plain text is untouched`() {
        val result = parse("  Acheter du pain ")
        assertEquals("Acheter du pain", result.title)
        assertNull(result.date)
        assertTrue(result.tokens.isEmpty())
    }

    @Test
    fun `today and tomorrow and day after`() {
        assertEquals(friday, parse("Appeler Paul aujourd'hui").date)
        assertEquals(friday.plusDays(1), parse("Appeler Paul demain").date)
        assertEquals(friday.plusDays(2), parse("Appeler Paul après-demain").date)
        assertEquals(friday.plusDays(2), parse("Appeler Paul apres demain").date)
        assertEquals("Appeler Paul", parse("Appeler Paul demain").title)
    }

    @Test
    fun `accented and capitalised words match`() {
        assertEquals(friday.plusDays(1), parse("Payer DEMAIN").date)
        assertEquals(friday, parse("Payer Aujourd’hui").date)
    }

    @Test
    fun `bare weekday is the next occurrence after today`() {
        assertEquals(LocalDate.of(2026, 11, 6), parse("Sport vendredi").date)
        assertEquals(LocalDate.of(2026, 10, 31), parse("Sport samedi").date)
        assertEquals(LocalDate.of(2026, 11, 2), parse("Sport lundi").date)
        assertEquals(LocalDate.of(2026, 11, 4), parse("Sport mercredi").date)
        assertEquals("Sport", parse("Sport vendredi").title)
    }

    @Test
    fun `weekday keeps its leading connector out of the title`() {
        assertEquals("Dîner", parse("Dîner le samedi").title)
        assertEquals("Dîner", parse("Dîner ce samedi").title)
        assertEquals("Dîner", parse("Dîner pour samedi").title)
    }

    @Test
    fun `weekday prochain is that day next calendar week`() {
        assertEquals(LocalDate.of(2026, 11, 2), parse("Réunion lundi prochain").date)
        assertEquals(LocalDate.of(2026, 11, 6), parse("Réunion vendredi prochain").date)
        assertEquals("Réunion", parse("Réunion lundi prochain").title)
    }

    @Test
    fun `weekday prochain from midweek jumps to next week`() {
        val wednesday = Clock.fixed(Instant.parse("2026-10-28T09:00:00Z"), zone)
        val result = QuickAddParser.parse("Réunion vendredi prochain", wednesday, projects, tags)
        assertEquals(LocalDate.of(2026, 11, 6), result.date)
        val bare = QuickAddParser.parse("Réunion vendredi", wednesday, projects, tags)
        assertEquals(LocalDate.of(2026, 10, 30), bare.date)
    }

    @Test
    fun `in n days weeks and months`() {
        assertEquals(friday.plusDays(3), parse("Relancer dans 3 jours").date)
        assertEquals(friday.plusDays(1), parse("Relancer dans 1 jour").date)
        assertEquals(friday.plusWeeks(2), parse("Relancer dans 2 semaines").date)
        assertEquals(friday.plusMonths(1), parse("Relancer dans 1 mois").date)
        assertEquals(friday.plusWeeks(1), parse("Relancer dans une semaine").date)
        assertEquals("Relancer", parse("Relancer dans 3 jours").title)
    }

    @Test
    fun `this evening is today at 19h`() {
        val result = parse("Appeler maman ce soir")
        assertEquals(friday, result.date)
        assertEquals(LocalTime.of(19, 0), result.time)
        assertEquals("Appeler maman", result.title)
    }

    @Test
    fun `explicit time overrides this evening`() {
        val result = parse("Film ce soir à 20h30")
        assertEquals(LocalTime.of(20, 30), result.time)
        assertEquals("Film", result.title)
    }

    @Test
    fun `this weekend is the coming saturday`() {
        assertEquals(LocalDate.of(2026, 10, 31), parse("Ranger le garage ce week-end").date)
        assertEquals(LocalDate.of(2026, 10, 31), parse("Ranger ce weekend").date)
        assertEquals("Ranger le garage", parse("Ranger le garage ce week-end").title)
    }

    @Test
    fun `next week is monday of next week`() {
        assertEquals(LocalDate.of(2026, 11, 2), parse("Bilan semaine prochaine").date)
        assertEquals("Bilan", parse("Bilan la semaine prochaine").title)
    }

    @Test
    fun `times in the supported shapes`() {
        assertEquals(LocalTime.of(14, 0), parse("RDV demain à 14h").time)
        assertEquals(LocalTime.of(14, 30), parse("RDV demain 14h30").time)
        assertEquals(LocalTime.of(14, 30), parse("RDV demain à 14:30").time)
        assertEquals(LocalTime.of(9, 5), parse("RDV demain 9h05").time)
        assertEquals(LocalTime.of(12, 0), parse("Déjeuner demain à midi").time)
        assertEquals("RDV", parse("RDV demain à 14h").title)
    }

    @Test
    fun `a time alone lands today`() {
        val result = parse("Appeler Paul à 14h")
        assertEquals(friday, result.date)
        assertEquals(LocalTime.of(14, 0), result.time)
        assertEquals("Appeler Paul", result.title)
    }

    @Test
    fun `invalid times are left alone`() {
        val result = parse("Chapitre 25h99")
        assertNull(result.time)
        assertEquals("Chapitre 25h99", result.title)
    }

    @Test
    fun `priority tokens`() {
        assertEquals(TaskPriority.HIGH, parse("Facture !1").priority)
        assertEquals(TaskPriority.MEDIUM, parse("Facture !2").priority)
        assertEquals(TaskPriority.LOW, parse("!3 Facture").priority)
        assertEquals("Facture", parse("Facture !1").title)
        assertNull(parse("Quoi !4").priority)
        assertEquals("Quoi !4", parse("Quoi !4").title)
    }

    @Test
    fun `project by plus caret and hash fuzzy`() {
        assertEquals("p-home", parse("Tondre +maison").projectUid)
        assertEquals("p-home", parse("Tondre ^Maison").projectUid)
        assertEquals("p-home", parse("Tondre #maison").projectUid)
        assertEquals("p-admin", parse("Impôts #admin").projectUid)
        assertEquals("p-hermes", parse("Agent #hermes").projectUid)
        assertEquals("Tondre", parse("Tondre #maison").title)
    }

    @Test
    fun `ambiguous project prefix is not guessed`() {
        val result = parse("Truc #ho")
        assertNull(result.projectUid)
        assertEquals("Truc #ho", result.title)
    }

    @Test
    fun `tags by hash and at`() {
        assertEquals(listOf("t-perso"), parse("Appeler Paul #perso").tagUids)
        assertEquals(listOf("t-ia"), parse("Agent @ia").tagUids)
        assertEquals(listOf("t-perso", "t-ia"), parse("Truc #perso @ia").tagUids)
        assertEquals("Appeler Paul", parse("Appeler Paul #perso").title)
    }

    @Test
    fun `unknown hash token stays in the title`() {
        val result = parse("Parler de #inconnu")
        assertTrue(result.tagUids.isEmpty())
        assertNull(result.projectUid)
        assertEquals("Parler de #inconnu", result.title)
    }

    @Test
    fun `quoted multi word project`() {
        val custom = listOf(NamedRef("p-big", "Grand projet"))
        val result = QuickAddParser.parse("Écrire +\"grand projet\"", clock, custom, emptyList())
        assertEquals("p-big", result.projectUid)
        assertEquals("Écrire", result.title)
    }

    @Test
    fun `full sentence`() {
        val result = parse("Appeler Paul demain 14h #perso !1")
        assertEquals("Appeler Paul", result.title)
        assertEquals(friday.plusDays(1), result.date)
        assertEquals(LocalTime.of(14, 0), result.time)
        assertEquals(listOf("t-perso"), result.tagUids)
        assertEquals(TaskPriority.HIGH, result.priority)
        assertEquals(4, result.tokens.size)
    }

    @Test
    fun `ignored token stays in the title and is not parsed`() {
        val first = parse("Appeler Paul demain")
        val key = first.tokens.single().key
        val second = parse("Appeler Paul demain", ignored = setOf(key))
        assertNull(second.date)
        assertEquals("Appeler Paul demain", second.title)
    }

    @Test
    fun `only the first date is used`() {
        val result = parse("Voir demain puis vendredi")
        assertEquals(friday.plusDays(1), result.date)
        assertEquals("Voir puis vendredi", result.title)
    }

    @Test
    fun `words that merely contain a keyword are untouched`() {
        assertNull(parse("Demaine nouvelle").date)
        assertNull(parse("Samedis fous").date)
        assertEquals("Demaine nouvelle", parse("Demaine nouvelle").title)
    }

    @Test
    fun `everything recognised leaves a blank title`() {
        assertEquals("", parse("demain 14h").title)
    }
}
