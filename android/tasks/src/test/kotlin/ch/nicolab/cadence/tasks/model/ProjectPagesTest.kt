package ch.nicolab.cadence.tasks.model

import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ProjectPagesTest {
    private fun page(uid: String, url: String, title: String? = null, note: String? = null, project: String = "p1", day: Long = 1) =
        LinkItem(uid = uid, url = url, title = title, note = note, projectUid = project, createdAt = Instant.ofEpochSecond(day))

    @Test
    fun `une ligne par page, titre ou domaine en repli, note seulement si elle existe`() {
        val pages = listOf(
            page("a", "https://a.io/guide", title = "Guide", note = "à relire"),
            page("b", "https://b.io/x", note = "  "),
        )
        assertEquals(
            "- [Guide](https://a.io/guide) — à relire\n- [b.io](https://b.io/x)",
            ProjectPages.markdown(ProjectPages.of(pages, "p1")),
        )
    }

    @Test
    fun `les pages suivent l'ordre de création, celles d'un autre projet sont exclues, une note tient sur une ligne`() {
        val pages = listOf(
            page("late", "https://a.io/late", day = 20),
            page("other", "https://a.io/other", project = "p2", day = 5),
            page("early", "https://a.io/early", title = "Tôt", note = "une\n  deux", day = 10),
        )
        assertEquals(
            "- [Tôt](https://a.io/early) — une deux\n- [a.io](https://a.io/late)",
            ProjectPages.markdown(ProjectPages.of(pages, "p1")),
        )
    }

    @Test
    fun `les crochets du titre sont échappés pour rester un lien Markdown`() {
        assertEquals(
            "- [Titre \\[brut\\]](https://a.io/x)",
            ProjectPages.markdown(listOf(page("a", "https://a.io/x", title = "Titre [brut]"))),
        )
    }
}
