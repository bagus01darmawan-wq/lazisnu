# -----------------------------------------------------------------------------
# LAZISNU Mobile - Proguard / R8 Configuration
# Standar Arsitektur Bab 5.2 - Minify/R8 untuk Release Builds
# -----------------------------------------------------------------------------

# --- General Reflection & Annotation Attributes ---
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-keepattributes SourceFile, LineNumberTable
-dontwarn javax.annotation.**
-dontwarn okio.**

# --- React Native Core & JNI ---
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

-keep class com.facebook.react.** { *; }
-keep class com.facebook.react.bridge.JavaScriptModule { *; }
-keep class com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * extends com.facebook.react.bridge.NativeModule {
    public <methods>;
}

# --- Hermes JS Engine ---
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# --- MMKV Encrypted Offline Storage ---
-keep class com.tencent.mmkv.** { *; }
-keepclassmembers class com.tencent.mmkv.** { *; }

# --- React Native Keychain (Android Keystore Biometric) ---
-keep class com.oblador.keychain.** { *; }
-keepclassmembers class com.oblador.keychain.** { *; }

# --- React Native Reanimated & Gesture Handler ---
-keep class com.swmansion.reanimated.** { *; }
-keepclassmembers class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keepclassmembers class com.swmansion.gesturehandler.** { *; }

# --- React Native Screens & Safe Area Context ---
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }

# --- Google ML Kit Barcode Scanning & CameraKit ---
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.** { *; }
-keep class com.camerakit.** { *; }
-dontwarn com.google.mlkit.**

# --- Firebase App & Crashlytics ---
-keepattributes *Annotation*
-keepattributes SourceFile, LineNumberTable
-keep public class * extends java.lang.Exception
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# --- React Native NetInfo ---
-keep class com.reactnativecommunity.netinfo.** { *; }

# --- React Native Vector Icons ---
-keep class com.oblador.vectoricons.** { *; }
