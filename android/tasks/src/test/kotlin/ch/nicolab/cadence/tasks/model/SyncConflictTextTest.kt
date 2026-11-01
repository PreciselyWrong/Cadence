package ch.nicolab.cadence.tasks.model

import java.time.ZoneId
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SyncConflictTextTest {
    private val zone = ZoneId.of("Europe/Zurich")
    private val names = mapOf("p1" to "Maison", "t1" to "perso", "t2" to "sport")

    private fun render(field: String, value: kotlinx.serialization.json.JsonElement?) =
        SyncConflictText.render(field, value, zone) { _, uid -> names[uid] }

    @Test
    fun `les valeurs se lisent comme sur l'écran`() {
        assertEquals("Acheter du pain", render("name", JsonPrimitive("Acheter du pain")))
        assertEquals("(vide)", render("note", JsonNull))
        assertEquals("(vide)", render("note", JsonPrimitive("  ")))
        assertEquals("oui", render("pin_to_sidebar", JsonPrimitive(true)))
        assertEquals("3", render("priority", JsonPrimitive(3)))
        assertEquals("Maison", render("project_uid", JsonPrimitive("p1")))
        assertEquals("inconnu", render("project_uid", JsonPrimitive("inconnu")))
        assertEquals("perso, sport", render("tag_uids", JsonArray(listOf(JsonPrimitive("t1"), JsonPrimitive("t2")))))
        assertEquals("2 nov. 2026 09:00", render("due_date", JsonPrimitive("2026-11-02T08:00:00.000Z")))
    }

    @Test
    fun `entités et champs ont un libellé français, un inconnu reste lisible`() {
        assertEquals("Tâche", SyncConflictText.entityLabel("task"))
        assertEquals("habit goal", SyncConflictText.entityLabel("habit_goal"))
        assertEquals("Échéance", SyncConflictText.fieldLabel("due_date"))
        assertEquals("target minor", SyncConflictText.fieldLabel("target_minor"))
    }
}
