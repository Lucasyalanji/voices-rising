# Opens the deck in PowerPoint (hidden), checks it opens cleanly, and exports each slide as a PNG into .\render
# PowerPoint can't open files on very long paths, so work from a short copy.
$deck = Join-Path $env:TEMP 'vr-guide.pptx'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Voices Rising Guide.pptx') -Destination $deck -Force
$out = Join-Path $PSScriptRoot 'render'
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -Filter *.png -ErrorAction SilentlyContinue | Remove-Item -Force
$app = New-Object -ComObject PowerPoint.Application
try {
  $p = $app.Presentations.Open($deck, $true, $false, $false)   # read-only, no window
  "slides: " + $p.Slides.Count
  foreach ($s in $p.Slides) { $s.Export((Join-Path $out ("slide-{0:D2}.png" -f $s.SlideIndex)), 'PNG', 1280, 720) }
  $p.Close()
  "exported"
} finally { $app.Quit() }
