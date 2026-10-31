import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
}

dependencies {
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.kotlinx.serialization.json)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.test {
    useJUnitPlatform()
    // Golden fixtures shared with the server (fixtures/habits): a change reruns the tests.
    inputs.dir(rootProject.projectDir.resolve("../fixtures/habits"))
        .withPropertyName("goldenFixtures")
        .withPathSensitivity(PathSensitivity.RELATIVE)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
    }
}
