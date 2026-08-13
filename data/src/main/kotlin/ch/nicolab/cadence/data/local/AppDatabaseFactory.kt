package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room

object AppDatabaseFactory {
    fun create(context: Context): CadenceDatabase {
        return Room.databaseBuilder(
            context.applicationContext,
            CadenceDatabase::class.java,
            "cadence.db",
        ).build()
    }
}
