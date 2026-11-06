package ch.nicolab.cadence.tasks.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ProjectImageTest {
    private val server = "http://cadence.example/"

    @Test
    fun `an image stored on the server takes its address and the key`() {
        assertEquals(
            ProjectImageSource("http://cadence.example/api/uploads/projects/a.jpg", sendToken = true),
            ProjectImage.source(server, "/api/uploads/projects/a.jpg"),
        )
    }

    @Test
    fun `an image hosted elsewhere never receives the key`() {
        assertEquals(
            ProjectImageSource("https://images.example/a.jpg", sendToken = false),
            ProjectImage.source(server, "https://images.example/a.jpg"),
        )
    }

    @Test
    fun `a path that a client would read as another host is refused`() {
        assertNull(ProjectImage.source(server, "//evil.example/a.jpg"))
        assertNull(ProjectImage.source(server, "/\\evil.example/a.jpg"))
    }

    @Test
    fun `no image or an unknown scheme gives nothing`() {
        assertNull(ProjectImage.source(server, null))
        assertNull(ProjectImage.source(server, "  "))
        assertNull(ProjectImage.source(server, "file:///etc/passwd"))
        assertNull(ProjectImage.source(server, "banner.jpg"))
    }
}
