# App Android (Capacitor)

Mismo `appId` que iOS (`es.puntostudio.puntofalso`), nombre «Punto Falso», versión 1.0 (`versionCode 1`), minSdk 24, **compileSdk/targetSdk 36** (Google Play lo exige a apps nuevas desde el 31-08-2026). Solo vertical. La web sigue sirviéndose desde la raíz: `npm run web` copia lo necesario a `www/`.

## Requisitos en el PC
Android Studio (SDK + emulador) y **JDK 21** (Capacitor 8 / Gradle 8.14 no compilan con el Java 25 que trae Android Studio). Se compila con `JAVA_HOME` apuntando al JDK 21 (PowerShell: `$env:JAVA_HOME='C:\ruta\jdk-21'`) y `android/local.properties` con `sdk.dir=C:/Users/<tú>/AppData/Local/Android/Sdk` (no va al repo).

```
npm install
npm run android:sync      # copia la web a www/ y sincroniza android/
cd android
.\gradlew.bat assembleDebug    # APK de pruebas: app/build/outputs/apk/debug/
.\gradlew.bat bundleRelease    # .aab firmado: app/build/outputs/bundle/release/app-release.aab
```
Al subir versión: `versionCode`/`versionName` en `android/app/build.gradle` y `APP_VERSION` en `index.html`.

## Firma (Play App Signing)
`app-release.aab` se firma con la **clave de subida**, que vive FUERA del repo en `%USERPROFILE%\keystores\puntofalso\`: `punto-falso-upload.jks` (alias `punto-falso-upload`) y `keystore.properties` (rutas y contraseñas; `build.gradle` lo lee de ahí, o de `-PpfKeystoreProps=<ruta>`). `*.jks`, `*.keystore` y `keystore.properties` están en `.gitignore`. **Guarda copia del .jks y de sus contraseñas en un sitio seguro** (gestor de contraseñas): con Play App Signing, Google puede restablecer la clave de subida si se pierde, pero es un trámite lento. Sin el archivo, el release sale sin firmar.

## Qué es distinto de iOS
- **Plugin `AudioSesion`**: en Android existe una versión mínima (`AudioSesionPlugin.java`): `modo` no hace nada y `abrirAjustes` abre los ajustes de la app. La web también funciona si el plugin no existe (`if(A)` / `try`).
- **Micro**: `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS`. Al pulsar hablar, el WebView de Capacitor pide el permiso; si se deniega sale el mismo aviso con «Abrir Ajustes», con el texto de la ruta de Android.
- **Sign in with Apple**: no está en Android (el plugin es solo de iOS y el flujo web de Apple no vuelve a la app), así que `ANDROID` deja `APPLE=false`. Se entra con correo. Google tampoco se ofrece en la app (Google bloquea OAuth en WebViews).
- **Pantalla completa**: la página usa `viewport-fit=cover`; el plugin `SystemBars` de Capacitor 8 respeta las barras (relleno nativo o `env(safe-area-inset-*)` según la versión del WebView) y desplaza el contenido con el teclado. El fondo de la ventana sigue al claro/oscuro del sistema (`values/colors.xml`, `values-night/`).
- **Botón «atrás»** (`@capacitor/app`): cierra la hoja, el menú o el walkie abiertos; si no, hace lo mismo que «‹ Volver»; dentro de una partida abre el menú con «¿Salir/Terminar la partida?»; solo cierra la app desde la portada (preguntando si hay partida).
- Iconos y splash salen de `icons/` con `python -I scripts/iconos-android.py`.

## Pruebas
`tests/android.spec.js` simula el puente de Capacitor en Android (sin Apple, sin AudioSesion, botón atrás, aviso de micro). Falta probar en un dispositivo/emulador real (ver el informe de la entrega).
