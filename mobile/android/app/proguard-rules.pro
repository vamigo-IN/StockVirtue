# StockVirtue release R8/ProGuard keep rules.
# Flutter's gradle plugin already contributes the core Flutter keep rules;
# these cover the plugins we use that rely on reflection or optional deps.

# --- Flutter deferred components / Play Core (referenced but not bundled) ---
-dontwarn com.google.android.play.core.**
-keep class io.flutter.embedding.** { *; }

# --- Firebase (Auth, Core, Messaging) ---
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# --- Google Sign-In / Google APIs ---
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# --- Tink (used by flutter_secure_storage v10) ---
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**

# --- OkHttp / Conscrypt (transitive, optional) ---
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**

# Keep annotations & enums used reflectively.
-keepattributes *Annotation*
-keepclassmembers enum * { *; }
