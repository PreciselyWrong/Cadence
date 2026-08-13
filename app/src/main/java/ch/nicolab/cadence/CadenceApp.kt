package ch.nicolab.cadence

import android.app.Application
import ch.nicolab.cadence.data.local.AppDatabaseFactory
import ch.nicolab.cadence.data.local.CadenceRepository

class CadenceApp : Application() {
    val database by lazy { AppDatabaseFactory.create(this) }
    val repository by lazy { CadenceRepository(database) }
}
