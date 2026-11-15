package ch.nicolab.cadence.tasks.decisions

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class DecisionCardTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun parse(raw: String): DecisionCardData? =
        DecisionPayload.parse(json.parseToJsonElement(raw).jsonObject)

    @Test
    fun `une carte complète est lue avec ses choix et son conseil`() {
        val card = parse(
            """
            {
              "uid": "dec-1",
              "kind": "subscription",
              "kind_label": "Abonnements",
              "key": "sub:netflix",
              "title": "Netflix 17,99 €/mois",
              "context": "Non ouvert depuis 4 mois",
              "body": "Ligne 1\nLigne 2",
              "url": "https://www.netflix.com/account",
              "choices": [
                {"id": "keep", "label": "Garder"},
                {"id": "cancel", "label": "Résilier", "tone": "danger"}
              ],
              "recommended": "cancel",
              "reason": "Pas utilisé depuis juillet",
              "created_at": "2026-11-10T08:00:00Z"
            }
            """.trimIndent(),
        )!!

        assertEquals("dec-1", card.uid)
        assertEquals("subscription", card.kind)
        assertEquals("Abonnements", card.kindLabel)
        assertEquals("https://www.netflix.com/account", card.url)
        assertEquals(2, card.choices.size)
        assertEquals("cancel", card.recommended)
        assertEquals(true, card.choices[1].isDanger)
    }

    @Test
    fun `une url non https est ignorée et un recommandé inconnu est écarté`() {
        val card = parse(
            """
            {
              "uid": "dec-2",
              "kind": "finance",
              "kind_label": "Finances",
              "key": "fin:1",
              "title": "Facture",
              "url": "http://insecure.example/x",
              "choices": [
                {"id": "task", "label": "Tâche"},
                {"id": "ok", "label": "C'est bon"}
              ],
              "recommended": "unknown"
            }
            """.trimIndent(),
        )!!

        assertNull(card.url)
        assertNull(card.recommended)
    }

    @Test
    fun `une carte hors de 2 à 5 choix ou avec un type invalide est ignorée`() {
        assertNull(
            parse(
                """{"uid":"d1","kind":"finance","key":"k1","title":"T","choices":[{"id":"ok","label":"OK"}]}""",
            ),
        )
        assertNull(
            parse(
                """{"uid":"d1","kind":"BadKind","key":"k1","title":"T","choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}""",
            ),
        )
        assertNull(
            parse(
                """{"uid":"d1","kind":"finance","key":"k1","title":"T","choices":[{"id":"note","label":"Note"},{"id":"later","label":"Plus tard"}]}""",
            ),
        )
    }

    @Test
    fun `parseList écarte les cartes invalides sans lever d'exception`() {
        val body = json.parseToJsonElement(
            """
            {
              "items": [
                {"uid":"d1","kind":"family","kind_label":"Famille","key":"f1","title":"Courses","choices":[{"id":"nicolas","label":"Moi"},{"id":"audrey","label":"Audrey"}]},
                {"uid":"bad","kind":"family","key":"f2","title":"Incomplet","choices":[]}
              ],
              "count": 2
            }
            """.trimIndent(),
        ).jsonObject

        val list = DecisionPayload.parseList(body)
        assertEquals(listOf("d1"), list.map { it.uid })
    }

    @Test
    fun `l'appel différé porte la clé decision_uid, la route et la clé d'idempotence`() {
        val call = DecisionRequests.decide(
            uid = "dec 1",
            decision = "note",
            note = "Vérifier le contrat",
            key = "idem-1",
            label = "Décider",
        )
        assertEquals("decision:dec 1", call.key)
        assertEquals("POST", call.method)
        assertEquals("/api/decisions/dec+1/decide", call.path)
        assertEquals(JsonPrimitive("note"), call.body?.get("decision"))
        assertEquals(JsonPrimitive("Vérifier le contrat"), call.body?.get("note"))
        assertEquals(JsonPrimitive("idem-1"), call.body?.get("idempotency_key"))
    }
}
