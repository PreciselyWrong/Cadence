package ch.nicolab.cadence.tasks.notes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/** Mêmes cas que `frontend/components/Note/editor/__tests__/outline.test.ts`. */
class NoteOutlineTest {
    // « | » marque le curseur (deux : une sélection).
    private fun at(marked: String): TextEdit {
        val from = marked.indexOf('|')
        val second = marked.indexOf('|', from + 1)
        val doc = marked.replace("|", "")
        return TextEdit(doc, from, if (second < 0) from else second - 1)
    }

    private fun show(sel: TextEdit, edit: TextChange?): String? {
        edit ?: return null
        val doc = edit.applyTo(sel.text)
        val a = minOf(edit.anchor, edit.head)
        val b = maxOf(edit.anchor, edit.head)
        return if (a == b) doc.substring(0, a) + "|" + doc.substring(a)
        else doc.substring(0, a) + "|" + doc.substring(a, b) + "|" + doc.substring(b)
    }

    private fun run(marked: String, fn: (TextEdit) -> TextChange?): String? {
        val sel = at(marked)
        return show(sel, fn(sel))
    }

    @Nested
    inner class Parse {
        @Test
        fun `builds the tree from indented bullets`() {
            val o = NoteOutline.parse("- a\n  - b\n    - c\n  - d\n- e")
            assertEquals(
                listOf(listOf(0, null, 3, 0), listOf(1, 0, 2, 1), listOf(2, 1, 2, 2), listOf(3, 0, 3, 1), listOf(4, null, 4, 0)),
                o.items.map { listOf(it.line, it.parent, it.end, it.depth) },
            )
        }

        @Test
        fun `reads checkboxes, ordered markers and text`() {
            val o = NoteOutline.parse("1. one\n2. [x] two\n- [ ] three")
            assertEquals(
                listOf(listOf("1. ", "", "one"), listOf("2. ", "[x] ", "two"), listOf("- ", "[ ] ", "three")),
                o.items.map { listOf(it.marker, it.box, it.text) },
            )
        }

        @Test
        fun `keeps continuation lines, code and tables in their item`() {
            val doc = listOf("- a", "  more of a", "", "  ```", "  - not an item", "  ```", "  - child", "- b").joinToString("\n")
            val o = NoteOutline.parse(doc)
            assertEquals(listOf(0, 6, 7), o.items.map { it.line })
            assertEquals(5, o.items[0].contentEnd)
            assertEquals(6, o.items[0].end)
            assertEquals(listOf(0, 0, 0, 0, 0, 0), o.owner.subList(0, 6))
            assertEquals(listOf(true, true, true), o.code.subList(3, 6))
        }

        @Test
        fun `ends an item at prose, headings and blank lines before them`() {
            val o = NoteOutline.parse("- a\n\nProse\n# Title\n- b")
            assertEquals(0, o.items[0].end)
            assertEquals(listOf(0, null, null, null, 1), o.owner)
        }

        @Test
        fun `treats a lazy line right after item text as part of it`() {
            assertEquals(listOf(0, 0, null), NoteOutline.parse("- a\nlazy\n# h").owner)
        }

        @Test
        fun `does not read a rule as a bullet`() {
            assertTrue(NoteOutline.parse("- - -\n---").items.isEmpty())
        }
    }

    @Nested
    inner class Indent {
        @Test
        fun `makes the item a child of the one above, with its children`() {
            assertEquals("- a\n  - b|\n    - c", run("- a\n- b|\n  - c", NoteOutline::indentItems))
        }

        @Test
        fun `lines a child up with an ordered parent text`() {
            assertEquals("1. a\n   2. |b", run("1. a\n2. |b", NoteOutline::indentItems))
        }

        @Test
        fun `does nothing on a first child`() {
            val sel = at("- a\n  - |b")
            assertTrue(NoteOutline.isNoop(NoteOutline.indentItems(sel)!!, sel))
        }

        @Test
        fun `indents every selected item`() {
            assertEquals("- a\n  - |b\n  - c|", run("- a\n- |b\n- c|", NoteOutline::indentItems))
        }

        @Test
        fun `is not handled outside a list or in code`() {
            assertNull(NoteOutline.indentItems(at("plain |text")))
            assertNull(NoteOutline.indentItems(at("- a\n  ```\n  co|de\n  ```")))
        }
    }

    @Nested
    inner class Outdent {
        @Test
        fun `moves the item after its parent, later siblings stay put`() {
            assertEquals("- p\n  - b\n- |a\n  - a1\n- q", run("- p\n  - |a\n    - a1\n  - b\n- q") { NoteOutline.outdentItems(it) })
        }

        @Test
        fun `outdents the last child in place`() {
            assertEquals("- p\n  - x\n- y|", run("- p\n  - x\n  - y|") { NoteOutline.outdentItems(it) })
        }

        @Test
        fun `does nothing at the top level or under the zoom root`() {
            val top = at("- |a")
            assertTrue(NoteOutline.isNoop(NoteOutline.outdentItems(top)!!, top))
            val zoomed = at("- p\n  - |a")
            assertTrue(NoteOutline.isNoop(NoteOutline.outdentItems(zoomed, OutlineOptions(rootLine = 0))!!, zoomed))
        }
    }

    @Nested
    inner class Move {
        @Test
        fun `swaps the item and its children with the sibling above`() {
            assertEquals("- b|\n  - b1\n- a\n  - a1", run("- a\n  - a1\n- b|\n  - b1") { NoteOutline.moveItem(it, -1) })
        }

        @Test
        fun `swaps with the sibling below`() {
            assertEquals("- b\n- |a\n  - a1\n- c", run("- |a\n  - a1\n- b\n- c") { NoteOutline.moveItem(it, 1) })
        }

        @Test
        fun `keeps a blank line between siblings where it was`() {
            assertEquals("- |b\n\n- a", run("- a\n\n- |b") { NoteOutline.moveItem(it, -1) })
        }

        @Test
        fun `does nothing at the edge, and stays inside the parent`() {
            val sel = at("- p\n  - |x\n- q")
            assertTrue(NoteOutline.isNoop(NoteOutline.moveItem(sel, -1)!!, sel))
        }
    }

    @Nested
    inner class Split {
        private fun split(marked: String, options: OutlineOptions = OutlineOptions()) = run(marked) { NoteOutline.splitItem(it, options) }

        @Test
        fun `adds a sibling at the end of an item`() {
            assertEquals("- a\n- |\n- b", split("- a|\n- b"))
        }

        @Test
        fun `adds the sibling after the children of a folded item`() {
            assertEquals("- a\n  - a1\n- |\n- b", split("- a|\n  - a1\n- b", OutlineOptions(folded = { it == 0 })))
        }

        @Test
        fun `adds a first child at the end of an open item with children`() {
            assertEquals("- a\n  - |\n  - a1", split("- a|\n  - a1"))
        }

        @Test
        fun `splits in the middle, the second half keeps the children`() {
            assertEquals("- hello\n- |world\n  - c", split("- hello |world\n  - c"))
        }

        @Test
        fun `adds an empty item above when the caret is at the start`() {
            assertEquals("- \n- |text", split("- |text"))
        }

        @Test
        fun `continues numbering and unchecked boxes`() {
            assertEquals("1. one\n2. |", split("1. one|"))
            assertEquals("- [x] done\n- [ ] |", split("- [x] done|"))
        }

        @Test
        fun `outdents an empty child, leaves the list at the top level`() {
            assertEquals("- p\n- |", split("- p\n  - |"))
            assertEquals("- a\n|", split("- a\n- |"))
        }

        @Test
        fun `turns a prose line into a bullet and starts the next one`() {
            assertEquals("- Some prose\n- |", split("Some prose|"))
        }

        @Test
        fun `leaves headings, code and blank lines to Markdown`() {
            assertNull(NoteOutline.splitItem(at("# Title|")))
            assertNull(NoteOutline.splitItem(at("- a\n  ```\n  x|\n  ```")))
            assertNull(NoteOutline.splitItem(at("|")))
        }

        @Test
        fun `on the zoom root, adds a first child with the rest of the text`() {
            assertEquals("- p\n  - root\n    - |tail\n    - c", split("- p\n  - root| tail\n    - c", OutlineOptions(rootLine = 1)))
        }
    }

    @Nested
    inner class SoftBreak {
        @Test
        fun `breaks the line inside the item, lined up with its text`() {
            assertEquals("  - a\n    |b", run("  - a|b", NoteOutline::softBreak))
        }

        @Test
        fun `is not handled outside an item`() {
            assertNull(NoteOutline.softBreak(at("text|")))
        }
    }

    @Nested
    inner class Backspace {
        private fun back(marked: String) = run(marked) { NoteOutline.backspaceItem(it) }

        @Test
        fun `removes the checkbox first`() {
            assertEquals("- |todo", back("- [ ] |todo"))
        }

        @Test
        fun `deletes an empty item into the line above`() {
            assertEquals("- a|", back("- a\n- |"))
        }

        @Test
        fun `merges an item without children into the line above`() {
            assertEquals("- a|b", back("- a\n  - |b"))
        }

        @Test
        fun `turns the first item into a plain line`() {
            assertEquals("|a", back("- |a"))
        }

        @Test
        fun `does nothing on an item with children or on the zoom root`() {
            val sel = at("- x\n- |a\n  - c")
            assertTrue(NoteOutline.isNoop(NoteOutline.backspaceItem(sel)!!, sel))
            val root = at("- |a")
            assertTrue(NoteOutline.isNoop(NoteOutline.backspaceItem(root, OutlineOptions(rootLine = 0))!!, root))
        }

        @Test
        fun `is not handled elsewhere in the text`() {
            assertNull(NoteOutline.backspaceItem(at("- a|b")))
        }
    }

    @Nested
    inner class ToggleBox {
        @Test
        fun `cycles none, unchecked, checked, unchecked`() {
            assertEquals("- [ ] a|", run("- a|", NoteOutline::toggleItemBox))
            assertEquals("- [x] a|", run("- [ ] a|", NoteOutline::toggleItemBox))
            assertEquals("- [ ] a|", run("- [x] a|", NoteOutline::toggleItemBox))
        }

        @Test
        fun `makes a plain line a checkbox item`() {
            assertEquals("- [ ] call Bob|", run("call Bob|", NoteOutline::toggleItemBox))
        }
    }

    @Nested
    inner class Helpers {
        private val doc = "- a\n  - a1\n    - a2\n- b"

        @Test
        fun `folds from the end of the first line to the end of the subtree`() {
            assertEquals(3..19, NoteOutline.foldRange(doc, 0))
            assertNull(NoteOutline.foldRange(doc, 3))
        }

        @Test
        fun `keys items by text and rank among equal texts`() {
            assertEquals(listOf("a#0", "b#0", "a#1"), NoteOutline.itemKeys(NoteOutline.parse("- A\n- b\n- a")).values.toList())
        }

        @Test
        fun `lists the ancestors of an item`() {
            assertEquals(listOf(0, 1, 2), NoteOutline.ancestorLines(NoteOutline.parse(doc), 2))
        }

        @Test
        fun `cuts out a subtree and puts an edited one back`() {
            assertEquals("- a1\n  - a2", NoteOutline.subtreeText(doc, 1))
            assertEquals("- a\n  - A1\n    - [x] a2\n- b", NoteOutline.replaceSubtree(doc, 1, "- A1\n  - [x] a2"))
        }
    }

    @Nested
    inner class Tasks {
        @Test
        fun `strips Markdown from the item text`() {
            assertEquals("Call Bob about Trip and Ann", NoteOutline.plainItemText("Call **Bob** about [[Trip]] and @[Ann](person:a1)"))
            assertEquals("see docs now", NoteOutline.plainItemText("see [docs](https://x.dev) `now`"))
        }

        @Test
        fun `replaces the text with a task link and keeps the box`() {
            val sel = at("- [ ] Call |Bob\n- x")
            val made = NoteOutline.taskFromItem(sel)!!
            assertEquals("Call Bob", made.name)
            assertEquals("- [ ] [[task:Call Bob]]\n- x", made.edit.applyTo(sel.text))
        }

        @Test
        fun `does not convert an empty item or an existing task link`() {
            assertNull(NoteOutline.taskFromItem(at("- |")))
            assertNull(NoteOutline.taskFromItem(at("- [[task:Call]]|")))
            assertNull(NoteOutline.taskFromItem(at("prose|")))
        }
    }

    @Nested
    inner class AutoBullet {
        @Test
        fun `starts typing on an empty top-level line with a bullet`() {
            assertEquals("- a", NoteOutline.autoBullet("", 0, "a"))
            assertEquals("- x", NoteOutline.autoBullet("# Title\n", 8, "x"))
        }

        @Test
        fun `leaves Markdown block starters and filled lines alone`() {
            for (ch in listOf("#", ">", "|", "`", "-", "*", " ")) assertNull(NoteOutline.autoBullet("", 0, ch))
            assertNull(NoteOutline.autoBullet("abc", 3, "d"))
            assertNull(NoteOutline.autoBullet("```\n\n```", 4, "x"))
        }
    }
}
