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
            CadenceDatabase.MIGRATION_5_6,
            CadenceDatabase.MIGRATION_6_7,
            CadenceDatabase.MIGRATION_7_8,
            CadenceDatabase.MIGRATION_8_9,
            CadenceDatabase.MIGRATION_9_10,
            CadenceDatabase.MIGRATION_10_11,
            CadenceDatabase.MIGRATION_11_12,
            CadenceDatabase.MIGRATION_12_13,
            CadenceDatabase.MIGRATION_13_14,
            CadenceDatabase.MIGRATION_14_15,
        )
        .build()
    }
}
