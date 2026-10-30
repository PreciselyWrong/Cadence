package ch.nicolab.cadence.health

import androidx.annotation.StringRes
import androidx.health.connect.client.records.ExerciseSessionRecord
import ch.nicolab.cadence.R

data class HealthExerciseType(val value: Int, @param:StringRes val label: Int)

/** Catalogue français des types stables proposés par Cadence. */
object HealthExerciseCatalog {
    val types = listOf(
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_WALKING, R.string.exercise_walking),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, R.string.exercise_running),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL, R.string.exercise_treadmill),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_BIKING, R.string.exercise_biking),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY, R.string.exercise_stationary_biking),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL, R.string.exercise_swimming),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER, R.string.exercise_open_water_swimming),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING, R.string.exercise_weightlifting),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, R.string.exercise_strength_training),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_HIKING, R.string.exercise_hiking),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_YOGA, R.string.exercise_yoga),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_PILATES, R.string.exercise_pilates),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_ROWING, R.string.exercise_rowing),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE, R.string.exercise_rowing_machine),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING, R.string.exercise_hiit),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_DANCING, R.string.exercise_dancing),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL, R.string.exercise_elliptical),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING, R.string.exercise_stairs),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING, R.string.exercise_stretching),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS, R.string.exercise_calisthenics),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS, R.string.exercise_class),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_BOXING, R.string.exercise_boxing),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS, R.string.exercise_martial_arts),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING, R.string.exercise_climbing),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_SKIING, R.string.exercise_skiing),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING, R.string.exercise_snowboarding),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_TENNIS, R.string.exercise_tennis),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON, R.string.exercise_badminton),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_SOCCER, R.string.exercise_soccer),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL, R.string.exercise_basketball),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_VOLLEYBALL, R.string.exercise_volleyball),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_RUGBY, R.string.exercise_rugby),
        HealthExerciseType(ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT, R.string.exercise_other),
    )
}
