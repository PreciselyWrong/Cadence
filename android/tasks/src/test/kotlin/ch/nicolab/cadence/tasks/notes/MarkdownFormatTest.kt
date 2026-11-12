package ch.nicolab.cadence.tasks.notes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Mêmes cas que `frontend/components/Note/editor/__tests__/markdownFormat.test.ts` (sans les retouches de tableau). */
class MarkdownFormatTest {
    // « | » marque le curseur, « [ » et « ] » une sélection.
    private fun parse(marked: String): TextEdit {
        val from = marked.indexOfFirst { it == '|' || it == '[' }
        val doc = marked.replace(Regex("""[|\[\]]"""), "")
        val close = marked.indexOf(']')
        return TextEdit(doc, from, if (close == -1) from else close - 1)
    }

    private fun run(marked: String, fn: (TextEdit) -> TextChange): String {
        val sel = parse(marked)
        val edit = fn(sel)
        val out = edit.applyTo(sel.text)
        return if (edit.anchor == edit.head) out.substring(0, edit.head) + "|" + out.substring(edit.head)
        else out.substring(0, edit.anchor) + "[" + out.substring(edit.anchor, edit.head) + "]" + out.substring(edit.head)
    }

    @Test
    fun `wraps, unwraps and places the caret between empty markers`() {
        assertEquals("say **[hi]** now", run("say [hi] now") { MarkdownFormat.toggleWrap(it, "**") })
        assertEquals("say [hi] now", run("say **[hi]** now") { MarkdownFormat.toggleWrap(it, "**") })
        assertEquals("say [hi] now", run("say [**hi**] now") { MarkdownFormat.toggleWrap(it, "**") })
        assertEquals("a _|_ b", run("a | b") { MarkdownFormat.toggleWrap(it, "_") })
    }

    @Test
    fun `works inside a list item`() {
        assertEquals("- buy ~~[milk]~~", run("- buy [milk]") { MarkdownFormat.toggleWrap(it, "~~") })
    }

    @Test
    fun `makes a link with the url ready to type`() {
        assertEquals("see [docs]([url])", run("see [docs]", MarkdownFormat::insertLink))
        assertEquals("[|](https://a.b/c)", run("[https://a.b/c]", MarkdownFormat::insertLink))
    }

    @Test
    fun `uses inline code on one line and a fenced block across lines`() {
        assertEquals("run `[ls]`", run("run [ls]", MarkdownFormat::toggleCode))
        assertEquals("```\na\nb\n```|", run("[a\nb]", MarkdownFormat::toggleCode))
    }

    @Test
    fun `sets, changes and removes a heading`() {
        assertEquals("## Title|", run("Ti|tle") { MarkdownFormat.toggleHeading(it, 2) })
        assertEquals("## Title|", run("# Ti|tle") { MarkdownFormat.toggleHeading(it, 2) })
        assertEquals("Title|", run("## Ti|tle") { MarkdownFormat.toggleHeading(it, 2) })
        assertEquals("- ### item|", run("- it|em") { MarkdownFormat.toggleHeading(it, 3) })
        assertEquals("# Title|", run("Ti|tle", MarkdownFormat::cycleHeading))
        assertEquals("### Title|", run("## Ti|tle", MarkdownFormat::cycleHeading))
        assertEquals("Title|", run("### Ti|tle", MarkdownFormat::cycleHeading))
    }

    @Test
    fun `turns lines into lists and back, keeping nested indents`() {
        assertEquals("1. a\n2. b|", run("[a\nb]") { MarkdownFormat.toggleLinePrefix(it, LineKind.NUMBER) })
        assertEquals("a\n  b|", run("[- a\n  - b]") { MarkdownFormat.toggleLinePrefix(it, LineKind.BULLET) })
        assertEquals("- [ ] a\n  - [ ] b|", run("[- a\n  - b]") { MarkdownFormat.toggleLinePrefix(it, LineKind.TASK) })
        val done = "- [x] do"
        assertEquals("do", MarkdownFormat.toggleLinePrefix(TextEdit(done, 8, 8), LineKind.TASK).applyTo(done))
        assertEquals("> quote|", run("qu|ote") { MarkdownFormat.toggleLinePrefix(it, LineKind.QUOTE) })
        assertEquals("quote|", run("> qu|ote") { MarkdownFormat.toggleLinePrefix(it, LineKind.QUOTE) })
    }

    @Test
    fun `inserts a table after the line, caret in the first header cell`() {
        assertEquals("Intro\n\n| |Column 1 | Column 2 |\n| --- | --- |\n|   |   |", run("Intro|") { MarkdownFormat.insertTable(it, 2, 2) })
    }

    @Test
    fun `indents a table under a list item`() {
        assertEquals("- item\n\n  | |H |\n  | --- |", run("- item|") { MarkdownFormat.insertTable(it, 1, 1) { "H" } })
    }
}
