# One-time setup: installs Java 21 (Eclipse Temurin) and the Android SDK into your user folders,
# then builds the Voices Rising APK. Safe to run again: it skips anything already installed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$tools = Join-Path $env:LOCALAPPDATA 'VoicesRisingBuild'
$jdk = Join-Path $tools 'jdk'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
New-Item -ItemType Directory -Force (Join-Path $tools 'dl') | Out-Null

if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) {
  Write-Host '=== Downloading Java 21 (Eclipse Temurin, ~196 MB) ==='
  $zip = Join-Path $tools 'dl\jdk21.zip'
  curl.exe -fL --progress-bar -o $zip 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse'
  $tmp = Join-Path $tools 'jdk-tmp'
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive -Force $zip $tmp
  Move-Item (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName $jdk
  Remove-Item -Recurse -Force $tmp
} else { Write-Host 'Java 21 already installed.' }

$sdkmanager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  Write-Host '=== Downloading Android command-line tools (~147 MB) ==='
  $zip = Join-Path $tools 'dl\cmdline-tools.zip'
  curl.exe -fL --progress-bar -o $zip 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
  $tmp = Join-Path $sdk 'cmdline-tools\tmp'
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive -Force $zip $tmp
  Move-Item (Join-Path $tmp 'cmdline-tools') (Join-Path $sdk 'cmdline-tools\latest')
  Remove-Item -Recurse -Force $tmp
} else { Write-Host 'Android command-line tools already installed.' }

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:Path = (Join-Path $jdk 'bin') + ';' + $env:Path

if (-not (Test-Path (Join-Path $sdk 'platforms\android-35'))) {
  Write-Host '=== Accepting the Android SDK licence and installing Android 15 (API 35) ==='
  $yes = Join-Path $tools 'yes.txt'
  Set-Content -Encoding ascii $yes (("y`r`n") * 40)
  cmd /c "`"$sdkmanager`" --sdk_root=`"$sdk`" --licenses < `"$yes`""
  cmd /c "`"$sdkmanager`" --sdk_root=`"$sdk`" platform-tools platforms;android-35 build-tools;35.0.0 < `"$yes`""
} else { Write-Host 'Android 15 SDK already installed.' }

# Tell Gradle where the SDK is
$local = Join-Path $PSScriptRoot 'android\local.properties'
Set-Content -Encoding ascii $local ('sdk.dir=' + ($sdk -replace '\\', '\\'))

Write-Host ''
Write-Host '=== Building the APK ==='
& (Join-Path $PSScriptRoot 'build-apk.cmd')
