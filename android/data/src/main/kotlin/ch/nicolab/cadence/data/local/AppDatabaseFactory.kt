package ch.nicolab.cadence.data.local

import android.content.Context
import androidx.room.Room
import ch.nicolab.cadence.data.sync.HabitSyncTriggers

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
            CadenceDatabase.MIGRATION_15_16,
            CadenceDatabase.MIGRATION_16_17,
            CadenceDatabase.MIGRATION_17_18,
            CadenceDatabase.MIGRATION_18_19,
            CadenceDatabase.MIGRATION_19_20,
            CadenceDatabase.MIGRATION_20_21,
            CadenceDatabase.MIGRATION_21_22,
            CadenceDatabase.MIGRATION_22_23,
            CadenceDatabase.MIGRATION_23_24,
            CadenceDatabase.MIGRATION_24_25,
            CadenceDatabase.MIGRATION_25_26,
        )
        .addCallback(HabitSyncTriggers.callback)
        .build()
    }
}
