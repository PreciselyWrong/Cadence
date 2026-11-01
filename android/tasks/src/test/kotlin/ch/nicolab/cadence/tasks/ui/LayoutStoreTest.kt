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
        assertTrue(store.isGallery(LayoutStore.NOTES))
        assertFalse(store.isGallery(LayoutStore.LINKS))
    }

    @Test
    fun `le choix d'un écran est retenu sans toucher à l'autre`() {
        store.setGallery(LayoutStore.NOTES, false)
        store.setGallery(LayoutStore.LINKS, true)

        assertFalse(store.isGallery(LayoutStore.NOTES))
        assertTrue(store.isGallery(LayoutStore.LINKS))
    }
}
