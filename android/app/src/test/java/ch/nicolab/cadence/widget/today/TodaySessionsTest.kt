package ch.nicolab.cadence.widget.today

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Glance 1.1 renvoie la vue au lanceur à chaque `update()` d'une session ouverte (état de session
 * en `neverEqualPolicy`), même si rien ne change, et Smart Launcher fait sauter le widget à chaque
 * envoi. Une session ouverte suit déjà la base : seuls les widgets sans session sont réveillés.
 */
class TodaySessionsTest {
    @Test
    fun `un widget dont la session suit la base n'est pas reveille`() {
        val sessions = TodaySessions()
        sessions.opened(7)

        assertEquals(listOf(9), sessions.needingUpdate(listOf(7, 9)))
    }

    @Test
    fun `une session fermee rend le widget au reveil`() {
        val sessions = TodaySessions()
        sessions.opened(7)
        sessions.closed(7)

        assertEquals(listOf(7), sessions.needingUpdate(listOf(7)))
    }

    @Test
    fun `une nouvelle session ouverte avant la fermeture de l'ancienne garde le widget suivi`() {
        val sessions = TodaySessions()
        sessions.opened(7)
        sessions.opened(7)
        sessions.closed(7)

        assertEquals(emptyList<Int>(), sessions.needingUpdate(listOf(7)))
    }
}
