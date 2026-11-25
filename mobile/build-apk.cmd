@echo off
rem Builds the Voices Rising Android app (debug APK).
rem Uses the JDK and Android SDK installed in your user folders.
setlocal
set "JAVA_HOME=%LOCALAPPDATA%\VoicesRisingBuild\jdk"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "%~dp0"

echo.
echo === Copying the app's web files into the Android project ===
call npx cap sync android || goto :fail

echo.
echo === Building the APK (the first build takes a few minutes) ===
cd /d "%~dp0android"
rem Call Gradle by full path: this PC has NoDefaultCurrentDirectoryInExePath set, so cmd won't run it by bare name.
call "%~dp0android\gradlew.bat" assembleDebug || goto :fail

rem The project path is longer than Windows' 260-character limit, so use robocopy (long-path safe)
rem and put the finished app in your Downloads folder.
set "OUT=%USERPROFILE%\Downloads"
robocopy "%~dp0android\app\build\outputs\apk\debug" "%OUT%\VoicesRisingAPK" app-debug.apk /NJH /NJS /NP >nul
move /y "%OUT%\VoicesRisingAPK\app-debug.apk" "%OUT%\VoicesRising.apk" >nul || goto :fail
rd "%OUT%\VoicesRisingAPK"
echo.
echo ============================================================
echo  Done!  Your app is here:
echo  %OUT%\VoicesRising.apk
echo ============================================================
explorer /select,"%OUT%\VoicesRising.apk"
pause
exit /b 0

:fail
echo.
echo Build failed - scroll up to see the error.
pause
exit /b 1
