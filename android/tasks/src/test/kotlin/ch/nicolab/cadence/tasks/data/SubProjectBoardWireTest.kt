package ch.nicolab.cadence.tasks.data

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class SubProjectBoardWireTest {
    private fun parse(text: String) = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `a task keeps its file section and bullet position in their own columns`() {
        val row = WireCodec.taskFromWire(
            parse("""{"uid":"t1","name":"Puce","source_key":"k","source_section":"Now","source_position":4,"estimated_minutes":30}"""),
        )
        assertEquals("Now", row.sourceSection)
        assertEquals(4, row.sourcePosition)
        val extras = TaskExtras.parse(row.extrasJson)
        assertFalse("source_section" in extras || "source_position" in extras)
        assertEquals("30", extras["estimated_minutes"])
    }

    @Test
    fun `a task outside any file has no section`() {
        val row = WireCodec.taskFromWire(parse("""{"uid":"t1","name":"Libre","source_section":null,"source_position":null}"""))
        assertNull(row.sourceSection)
        assertNull(row.sourcePosition)
    }

    @Test
    fun `a project keeps its current state and reads it as a handoff`() {
        val entity = WireCodec.projectFromWire(
            parse(
                """{"uid":"p1","name":"Cadence","handoff_state":{"section":"État actuel","branch":"main","tree":"propre",
                "tests":"ok","blockers":"CI rouge","next_action":"Corriger la CI","raw":"...","updated_at":"2026-11-20T10:00:00.000Z"}}""",
            ),
        )
        val handoff = entity.toItem().handoff!!
        assertEquals("Corriger la CI", handoff.nextAction)
        assertEquals("CI rouge", handoff.blockers)
        assertEquals("main", handoff.branch)
        assertEquals("propre", handoff.tree)
        assertEquals(Instant.parse("2026-11-20T10:00:00Z"), handoff.updatedAt)
    }

    @Test
    fun `a project without current state has no handoff`() {
        assertNull(WireCodec.projectFromWire(parse("""{"uid":"p1","name":"Cadence","handoff_state":null}""")).toItem().handoff)
        assertNull(WireCodec.projectFromWire(parse("""{"uid":"p1","name":"Cadence"}""")).toItem().handoff)
    }
}
