# Outil de dev : essaie l'API locale (wrangler dev doit tourner). Le jeton est lu dans
# api/.dev.vars sans être affiché.
#   Extraction : .\api\scripts\try-api.ps1 -Photos photo1.jpg, photo2.jpg
#   Génération : .\api\scripts\try-api.ps1 -TextFile cours.txt [-Subject "Histoire-Géographie"]
param(
  [Parameter(Mandatory, ParameterSetName = 'extract')][string[]]$Photos,
  [Parameter(Mandatory, ParameterSetName = 'generate')][string]$TextFile,
  [Parameter(ParameterSetName = 'generate')][string]$Subject = ''
)

Add-Type -AssemblyName System.Drawing

# Même traitement que l'appli : redressée, 1600 px max, JPEG
function ConvertTo-CompressedJpeg([string]$path) {
  $image = [Drawing.Image]::FromFile((Resolve-Path $path))
  try {
    if ($image.PropertyIdList -contains 274) {
      switch ($image.GetPropertyItem(274).Value[0]) {
        3 { $image.RotateFlip('Rotate180FlipNone') }
        6 { $image.RotateFlip('Rotate90FlipNone') }
        8 { $image.RotateFlip('Rotate270FlipNone') }
      }
    }
    $scale = [Math]::Min(1, 1600 / [Math]::Max($image.Width, $image.Height))
    $bitmap = New-Object Drawing.Bitmap $image, ([int]($image.Width * $scale)), ([int]($image.Height * $scale))
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Jpeg)
    $bitmap.Dispose()
    return [Convert]::ToBase64String($stream.ToArray())
  } finally {
    $image.Dispose()
  }
}

if ($PSCmdlet.ParameterSetName -eq 'extract') {
  $route = 'extract'
  $payload = @{ images = @($Photos | ForEach-Object { @{ mediaType = 'image/jpeg'; data = ConvertTo-CompressedJpeg $_ } }) }
} else {
  $route = 'generate'
  $text = [IO.File]::ReadAllText((Resolve-Path $TextFile), [Text.Encoding]::UTF8)
  $payload = @{ title = [IO.Path]::GetFileNameWithoutExtension($TextFile); subject = $Subject; text = $text }
}

$devVars = Join-Path $PSScriptRoot '..\.dev.vars'
# @() : avec une seule ligne, Get-Content renvoie une chaîne et -match renverrait True
$token = (@(Get-Content $devVars) -match '^APP_TOKEN=') -replace '^APP_TOKEN=', ''
$body = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 4))

try {
  $start = Get-Date
  $response = Invoke-WebRequest "http://localhost:8787/$route" -Method Post -Body $body -UseBasicParsing `
    -ContentType 'application/json; charset=utf-8' -Headers @{ Authorization = "Bearer $token" }
  # Décodage UTF-8 explicite : PowerShell 5.1 se trompe sur les accents sinon
  $result = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
  if ($route -eq 'extract') {
    Write-Host "Titre : $($result.title)" -ForegroundColor Cyan
    Write-Host $result.text
  } else {
    Write-Host 'L''essentiel' -ForegroundColor Cyan
    $result.sheet.keyPoints | ForEach-Object { Write-Host "- $($_.text)"; if ($_.example) { Write-Host "  Exemple : $($_.example)" } }
    Write-Host 'Les mots à retenir' -ForegroundColor Cyan
    $result.sheet.definitions | ForEach-Object { Write-Host "- $($_.term) : $($_.definition)" }
    Write-Host 'Flashcards' -ForegroundColor Cyan
    $result.flashcards | ForEach-Object { Write-Host "- $($_.front) -> $($_.back)" }
    Write-Host 'Quiz' -ForegroundColor Cyan
    $result.quiz | ForEach-Object { Write-Host "- $($_.question) [$($_.choices -join ' | ')] -> $($_.choices[$_.answer])" }
  }
  Write-Host ("(réponse en {0:N0} s)" -f ((Get-Date) - $start).TotalSeconds) -ForegroundColor DarkGray
} catch {
  Write-Host "Erreur : $($_.ErrorDetails.Message)" -ForegroundColor Red
} finally {
  Remove-Variable token
}
