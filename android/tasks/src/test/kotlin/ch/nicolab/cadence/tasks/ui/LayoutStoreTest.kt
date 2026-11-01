package ch.nicolab.cadence.tasks.ui

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Liste ou galerie, par écran : les notes s'ouvrent en galerie, les liens en liste, puis le choix est retenu. */
@RunWith(AndroidJUnit4::class)
class LayoutStoreTest {
    private val store = LayoutStore(ApplicationProvider.getApplicationContext<Context>())

    @Test
    fun `sans choix, chaque écran garde sa disposition par défaut`() {
        assertTrue(store.isOn(LayoutStore.NOTES))
        assertFalse(store.isOn(LayoutStore.LINKS))
    }

    @Test
    fun `le choix d'un écran est retenu sans toucher à l'autre`() {
        store.set(LayoutStore.NOTES, false)
        store.set(LayoutStore.LINKS, true)

        assertFalse(store.isOn(LayoutStore.NOTES))
        assertTrue(store.isOn(LayoutStore.LINKS))
    }
}
