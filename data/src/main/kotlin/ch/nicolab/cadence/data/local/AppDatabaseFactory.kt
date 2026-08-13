package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room

object AppDatabaseFactory {
    fun create(context: Context): CadenceDatabase {
        return Room.databaseBuilder(
            context.applicationContext,
            CadenceDatabase::class.java,
            "cadence.db",
        )
        .addMigrations(
            CadenceDatabase.MIGRATION_1_2,
            CadenceDatabase.MIGRATION_2_3,
            CadenceDatabase.MIGRATION_3_4,
            CadenceDatabase.MIGRATION_4_5,
        )
        .build()
    }
}
