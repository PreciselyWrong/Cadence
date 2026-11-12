package ch.nicolab.cadence.tasks.contentlinks

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PeopleTest {
    @Test
    fun `la reponse donne les personnes nommees, sans les incompletes`() {
        val response = Json.parseToJsonElement(
            """{"people":[{"uid":"a1","name":" Ann "},{"uid":"","name":"X"},{"uid":"b2"},{"uid":"c3","name":"Bob"}]}""",
        )
        assertEquals(listOf(MentionPerson("a1", "Ann"), MentionPerson("c3", "Bob")), PeopleClient.parse(response))
    }

    @Test
    fun `le choix garde les noms qui contiennent la saisie, debut de nom d'abord`() {
        val people = listOf(MentionPerson("1", "Joanna"), MentionPerson("2", "Anna"), MentionPerson("3", "Bob"))
        assertEquals(listOf("Anna", "Joanna"), PeopleClient.matching(people, "an").map { it.name })
        assertEquals(3, PeopleClient.matching(people, "").size)
    }
}
