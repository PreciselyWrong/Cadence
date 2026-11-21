package ch.nicolab.cadence.tasks.attachments

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AttachmentsTest {
    @Test
    fun `parseAttachmentsList parses task and project attachments`() {
        val raw = """
            [
              {
                "uid": "att-1",
                "original_filename": "rapport.pdf",
                "title": "Rapport Q4",
                "file_size": 1536,
                "mime_type": "application/pdf",
                "created_at": "2026-11-20T09:30:00.000Z"
              },
              {
                "uid": "att-2",
                "original_filename": "photo.png",
                "file_size": 2048000,
                "mime_type": "image/png"
              }
            ]
        """.trimIndent()
        val items = AttachmentsClient.parseAttachmentsList(Json.parseToJsonElement(raw))
        assertEquals(2, items.size)
        assertEquals("Rapport Q4", items[0].displayName)
        assertEquals("rapport.pdf", items[0].originalFilename)
        assertEquals(1536L, items[0].fileSize)
        assertEquals("application/pdf", items[0].mimeType)
        assertEquals("photo.png", items[1].displayName)
    }

    @Test
    fun `parseAttachmentsEnabled respects flag and hosted trial`() {
        val disabled = Json.parseToJsonElement("""{"featureFlags":{"attachments":false,"hosted":false}}""").jsonObject
        assertFalse(AttachmentsClient.parseAttachmentsEnabled(disabled))

        val enabled = Json.parseToJsonElement("""{"featureFlags":{"attachments":true,"hosted":false}}""").jsonObject
        assertTrue(AttachmentsClient.parseAttachmentsEnabled(enabled))

        val hostedTrialOff = Json.parseToJsonElement("""{"featureFlags":{"hosted":true}}""").jsonObject
        val billingOff = Json.parseToJsonElement("""{"reason":"trial","features":{"attachments":false}}""").jsonObject
        assertFalse(AttachmentsClient.parseAttachmentsEnabled(hostedTrialOff, billingOff))
    }

    @Test
    fun `formatFileSize formats bytes, KB and MB in French`() {
        assertEquals("512 o", AttachmentsClient.formatFileSize(512))
        assertEquals("1,5 Ko", AttachmentsClient.formatFileSize(1536))
        assertEquals("2,0 Mo", AttachmentsClient.formatFileSize(2 * 1024 * 1024L))
    }

    @Test
    fun `sanitizeCacheFilename strips traversal and unsafe characters`() {
        assertEquals(
            "att_1_mon_fichier.pdf",
            AttachmentsClient.sanitizeCacheFilename("att/1", "../../mon fichier.pdf"),
        )
    }

    @Test
    fun `target paths match task and project endpoints`() {
        val task = AttachmentTarget.Task("t1")
        assertEquals("/api/v1/tasks/t1/attachments", task.listPath)
        assertEquals("/api/v1/upload/task-attachment", task.uploadPath)
        assertEquals("/api/v1/tasks/t1/attachments/a1", task.deletePath("a1"))
        assertEquals("/api/v1/attachments/a1/download", task.downloadPath("a1"))

        val project = AttachmentTarget.Project("p1")
        assertEquals("/api/v1/project/p1/attachments", project.listPath)
        assertEquals("/api/v1/project/p1/attachments", project.uploadPath)
        assertEquals("/api/v1/project/p1/attachments/a1", project.deletePath("a1"))
        assertEquals("/api/v1/project/p1/attachments/a1/download", project.downloadPath("a1"))
    }
}
