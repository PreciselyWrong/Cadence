package ch.nicolab.cadence.tasks.autoclassify

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AutoClassifyChoicesTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun card(
        options: List<String> = listOf("p1", "p2"),
        area: String? = "a1",
        tags: List<String> = listOf("courses"),
        priority: Int? = 2,
    ) = ClassifyCard(
        suggestionUid = "s1",
        entity = "task",
        itemUid = "t1",
        title = "Acheter du lait",
        project = ProjectOffer(
            options = options.map { ProjectOption(it, "Projet $it", null) },
            area = area?.let { AreaOffer(it, "Vie") },
            newProject = NewProjectOffer("Épicerie", "a1", "Vie"),
        ),
        tags = TagOffer(tags, newTag = "lait"),
        priority = priority,
    )

    @Test
    fun acceptAllIsTheWordAllAndNothingElse() {
        assertEquals("all", AutoClassifyChoices.ACCEPT_ALL.jsonPrimitive.content)
        assertEquals("none", AutoClassifyChoices.NONE.jsonPrimitive.content)
    }

    @Test
    fun theDefaultAnswerIsWhatAcceptAllWouldDo() {
        val answer = AutoClassifyChoices.defaultAnswer(card())

        assertEquals(ProjectAnswer.Existing("p1"), answer.project)
        assertEquals(listOf("courses"), answer.tags)
        assertNull(answer.newTag)
        assertEquals(2, answer.priority)
    }

    @Test
    fun withoutOptionsTheDefaultFallsBackToTheAreaThenToNoProject() {
        assertEquals(ProjectAnswer.Area("a1"), AutoClassifyChoices.defaultAnswer(card(options = emptyList())).project)
        assertEquals(ProjectAnswer.None, AutoClassifyChoices.defaultAnswer(card(options = emptyList(), area = null)).project)
    }

    @Test
    fun aUserAnswerCarriesProjectTagsNewTagAndPriority() {
        val body = AutoClassifyChoices.answer(
            ClassifyAnswer(
                project = ProjectAnswer.NewProject("Épicerie", "a1"),
                tags = listOf("courses"),
                newTag = "lait",
                priority = null,
            ),
        )

        val project = body["project"]!!.jsonObject
        assertEquals("new_project", project["type"]!!.jsonPrimitive.content)
        assertEquals("Épicerie", project["name"]!!.jsonPrimitive.content)
        assertEquals("a1", project["area_uid"]!!.jsonPrimitive.content)
        assertEquals(listOf("courses"), body["tags"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertEquals("lait", body["new_tag"]!!.jsonPrimitive.content)
        assertEquals(JsonNull, body["priority"])
    }

    @Test
    fun aNoneProjectAndAnAreaProjectAreEncodedAsTheServerReadsThem() {
        val none = AutoClassifyChoices.answer(ClassifyAnswer(ProjectAnswer.None, emptyList(), null, null))
        val area = AutoClassifyChoices.answer(ClassifyAnswer(ProjectAnswer.Area("a1"), emptyList(), null, 1))

        assertEquals("none", none["project"]!!.jsonObject["type"]!!.jsonPrimitive.content)
        assertEquals("area", area["project"]!!.jsonObject["type"]!!.jsonPrimitive.content)
        assertEquals("a1", area["project"]!!.jsonObject["uid"]!!.jsonPrimitive.content)
        assertEquals(1, area["priority"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun aDuplicateChoiceCarriesOnlyItsAction() {
        assertEquals(JsonObject(mapOf("action" to JsonPrimitive("merge"))), AutoClassifyChoices.duplicate("merge"))
    }

    @Test
    fun answersToOneSuggestionShareOneKeySoOnlyTheLastOneIsSent() {
        val apply = AutoClassifyRequests.apply("s1", AutoClassifyChoices.ACCEPT_ALL, "Classement")
        val dismiss = AutoClassifyRequests.dismiss("s1", "Classement")

        assertEquals(apply.key, dismiss.key)
        assertEquals("/api/v1/auto-classify/suggestions/s1/apply", apply.path)
        assertEquals("/api/v1/auto-classify/suggestions/s1/dismiss", dismiss.path)
        assertEquals("all", apply.body!!["choice"]!!.jsonPrimitive.content)
    }

    @Test
    fun aNotificationActionMapsToItsChoice() {
        val accept = AutoClassifyRequests.forNotificationAction(AutoClassifyRequests.ACTION_ACCEPT_ALL, "s1", "C")
        val drop = AutoClassifyRequests.forNotificationAction(AutoClassifyRequests.ACTION_DROP_NEW, "s2", "C")
        val merge = AutoClassifyRequests.forNotificationAction(AutoClassifyRequests.ACTION_MERGE, "s2", "C")

        assertEquals("all", accept!!.body!!["choice"]!!.jsonPrimitive.content)
        assertEquals("drop_new", drop!!.body!!["choice"]!!.jsonObject["action"]!!.jsonPrimitive.content)
        assertEquals("merge", merge!!.body!!["choice"]!!.jsonObject["action"]!!.jsonPrimitive.content)
        assertNull(AutoClassifyRequests.forNotificationAction("unknown", "s1", "C"))
    }
}
