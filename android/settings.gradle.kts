pluginManagement {
    repositories {
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Cadence"
enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

include(":domain")
include(":data")
include(":tasks")
include(":designsystem")
include(":app")
