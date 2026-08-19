plugins {
  kotlin("jvm") version "2.1.10"
}

repositories {
  mavenCentral()
  maven("https://jitpack.io")
}

dependencies {
  // Official Pine Labs Android Native SDK source, verified in the installed guide.
  implementation("com.github.plural-pinelabs:Pinelabs-Android-SDK:1.10.0")
}
