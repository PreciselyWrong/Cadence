package ch.nicolab.cadence.tasks.quickadd

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class QuickAddSuggestionsTest {
    private fun at(text: String, cursor: Int = text.length) = QuickAddSuggestions.tokenAt(text, cursor)

    @Test
    fun `a sign alone opens its list right away`() {
        assertEquals(TokenAtCursor(SuggestionKind.TAG, 11, 12, ""), at("Acheter du #"))
        assertEquals(SuggestionKind.PROJECT, at("Appeler +")?.kind)
        assertEquals(SuggestionKind.PROJECT, at("Appeler ^")?.kind)
        assertEquals(TokenAtCursor(SuggestionKind.PRIORITY, 0, 1, ""), at("!"))
    }

    @Test
    fun `the query is what follows the sign up to the cursor`() {
        assertEquals("perso/sp", at("Courir #perso/sp")?.query)
        assertEquals("hôp", at("Rdv +hôp")?.query)
        assertEquals(4, at("Rdv +hôp")?.start)
    }

    @Test
    fun `a sign inside a word or after a letter opens nothing`() {
        assertNull(at("Apprendre C#"))
        assertNull(at("Super!"))
        assertNull(at("a+"))
        assertNull(at("mail@site"))
        assertNull(at("https://x.y/#"))
    }

    @Test
    fun `a space ends the token`() {
        assertNull(at("Courir #perso "))
        assertNull(at("Courir #perso demain"))
    }

    @Test
    fun `a priority sign offers nothing once a digit follows`() {
        assertNull(at("Payer !1"))
        assertNull(at("Payer !x"))
    }

    @Test
    fun `a quote lets a name hold spaces`() {
        val token = at("Rdv +\"Maison de ca")
        assertEquals(SuggestionKind.PROJECT, token?.kind)
        assertEquals("Maison de ca", token?.query)
        assertNull(at("Rdv +\"Maison\" fin"))
    }

    @Test
    fun `with the cursor inside a word the rest of the word is replaced`() {
        val text = "Courir #per demain"
        val token = at(text, cursor = 11)!!
        assertEquals("per", token.query)
        assertEquals("Courir #per".length, token.end)
    }

    @Test
    fun `inserting replaces the token and keeps one space`() {
        val text = "Courir #pe"
        val edit = QuickAddSuggestions.insert(text, at(text)!!, QuickAddSuggestions.tagToken("perso/sport"))
        assertEquals("Courir #perso/sport ", edit.text)
        assertEquals(edit.text.length, edit.cursor)
    }

    @Test
    fun `inserting in the middle does not double the space`() {
        val text = "Courir #pe demain"
        val edit = QuickAddSuggestions.insert(text, at(text, cursor = 10)!!, "#perso")
        assertEquals("Courir #perso demain", edit.text)
        assertEquals("Courir #perso ".length, edit.cursor)
    }

    @Test
    fun `inserting a priority at the start`() {
        val edit = QuickAddSuggestions.insert("!", at("!")!!, QuickAddSuggestions.priorityToken(1))
        assertEquals("!1 ", edit.text)
    }

    @Test
    fun `names that are not a word are quoted`() {
        assertEquals("#perso/sport", QuickAddSuggestions.tagToken("perso/sport"))
        assertEquals("+\"Maison de campagne\"", QuickAddSuggestions.projectToken("Maison de campagne"))
        assertEquals("+Hôpital", QuickAddSuggestions.projectToken("Hôpital"))
    }

    @Test
    fun `an inserted token is read back by the parser`() {
        val tags = listOf(NamedRef("t1", "perso/sport"))
        val projects = listOf(NamedRef("p1", "Maison de campagne"))
        val clock = java.time.Clock.systemUTC()
        val text = "Courir ${QuickAddSuggestions.tagToken("perso/sport")} ${QuickAddSuggestions.projectToken("Maison de campagne")} !1"
        val parsed = QuickAddParser.parse(text, clock, projects, tags)
        assertEquals(listOf("t1"), parsed.tagUids)
        assertEquals("p1", parsed.projectUid)
        assertEquals("Courir", parsed.title)
    }

    @Test
    fun `ranking puts prefixes first then the most used then alphabetical`() {
        data class Tag(val name: String, val uses: Int)
        val tags = listOf(Tag("perso/sport", 3), Tag("perso/admin", 9), Tag("sport", 1), Tag("Café", 0), Tag("work", 40))
        val names = { query: String -> QuickAddSuggestions.rank(tags, query, { it.name }, { it.uses }).map { it.name } }
        assertEquals(listOf("work", "perso/admin", "perso/sport", "sport", "Café"), names(""))
        assertEquals(listOf("sport", "perso/sport"), names("spo"))
        assertEquals(listOf("Café"), names("cafe"))
        assertEquals(emptyList<String>(), names("zzz"))
    }

    @Test
    fun `ranking is capped`() {
        val many = (1..30).map { "tag$it" }
        assertEquals(8, QuickAddSuggestions.rank(many, "tag", { it }).size)
    }

    @Test
    fun `une étiquette nouvelle se crée au nom tapé, sans chemin`() {
        assertEquals("xyz", QuickAddSuggestions.newTagName(" xyz "))
        assertEquals("Café au lait", QuickAddSuggestions.newTagName("Café au lait"))
        assertNull(QuickAddSuggestions.newTagName("   "))
        assertNull(QuickAddSuggestions.newTagName("perso/sport"))
    }
}
