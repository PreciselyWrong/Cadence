package ch.nicolab.cadence.tasks.links

import ch.nicolab.cadence.tasks.model.LinkKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** Mêmes vecteurs que `backend/tests/unit/modules/links/urls.test.js` : le serveur et l'appareil nomment pareil. */
class LinkKindsTest {
    @Test
    fun `normalizeUrl lowercases the host, drops the fragment and tracking params`() {
        assertEquals(
            "https://github.com/Owner/Repo?b=2",
            normalizeUrl("HTTPS://GitHub.com/Owner/Repo/?utm_source=x&b=2&fbclid=z#readme"),
        )
    }

    @Test
    fun `normalizeUrl keeps the root slash and strips a default port`() {
        assertEquals("https://example.com/", normalizeUrl("https://example.com:443"))
        assertEquals("http://example.com/a", normalizeUrl("http://example.com:80/a/"))
    }

    @Test
    fun `normalizeUrl returns null for a non-http url`() {
        assertNull(normalizeUrl("javascript:alert(1)"))
        assertNull(normalizeUrl("not a url"))
    }

    @Test
    fun `normalizeUrl keeps a non-default port and a query that is not tracking`() {
        assertEquals("https://example.com:8443/a?q=x", normalizeUrl("https://example.com:8443/a?q=x&UTM_Campaign=y"))
        assertEquals("https://x.io/a", normalizeUrl("https://x.io/a?gclid=1"))
    }

    @Test
    fun `addressKey drops www from the normalized address`() {
        assertEquals("https://github.com/acme/rocket", addressKey("https://www.github.com/acme/rocket/#readme"))
        assertEquals("https://github.com/acme/rocket", addressKey("https://github.com/acme/rocket?utm_source=x"))
        assertNull(addressKey("ftp://x.io"))
    }

    @Test
    fun `repoPath reads owner and repo on code hosts, without the git suffix`() {
        assertEquals(RepoPath("github.com", "a", "b"), repoPath("https://github.com/a/b"))
        assertEquals(RepoPath("gitlab.com", "a", "b"), repoPath("https://gitlab.com/a/b/-/tree/main"))
        assertEquals(RepoPath("codeberg.org", "a", "b"), repoPath("https://codeberg.org/a/b"))
        assertEquals(RepoPath("github.com", "a", "b"), repoPath("https://github.com/a/b.git"))
        assertEquals(RepoPath("github.com", "acme", "rocket"), repoPath("https://www.github.com/acme/rocket"))
    }

    @Test
    fun `repoPath refuses github pages that are not owners`() {
        assertNull(repoPath("https://github.com/features"))
        assertNull(repoPath("https://github.com/Settings/profile"))
        assertNull(repoPath("https://github.com/acme"))
        assertNull(repoPath("https://example.com/a/b"))
    }

    @Test
    fun `classifyKind recognizes code hosting repositories`() {
        assertEquals(LinkKind.REPO, classifyKind("https://github.com/a/b"))
        assertEquals(LinkKind.REPO, classifyKind("https://gitlab.com/a/b/-/tree/main"))
        assertEquals(LinkKind.REPO, classifyKind("https://codeberg.org/a/b"))
        assertEquals(LinkKind.OTHER, classifyKind("https://github.com/features"))
    }

    @Test
    fun `classifyKind recognizes videos by host and subdomains`() {
        assertEquals(LinkKind.VIDEO, classifyKind("https://youtu.be/abcdefghijk"))
        assertEquals(LinkKind.VIDEO, classifyKind("https://www.youtube.com/watch?v=x"))
        assertEquals(LinkKind.VIDEO, classifyKind("https://m.twitch.tv/x"))
    }

    @Test
    fun `classifyKind recognizes articles by blog hosts`() {
        assertEquals(LinkKind.ARTICLE, classifyKind("https://someone.substack.com/p/x"))
        assertEquals(LinkKind.ARTICLE, classifyKind("https://medium.com/@a/b"))
        assertEquals(LinkKind.ARTICLE, classifyKind("https://news.ycombinator.com/item?id=1"))
    }

    @Test
    fun `classifyKind treats a site home page without query as a tool`() {
        assertEquals(LinkKind.TOOL, classifyKind("https://excalidraw.com/"))
        assertEquals(LinkKind.TOOL, classifyKind("https://excalidraw.com"))
        assertEquals(LinkKind.OTHER, classifyKind("https://excalidraw.com/?utm_source=x"))
        assertEquals(LinkKind.OTHER, classifyKind("https://x.io/docs/page"))
    }
}
