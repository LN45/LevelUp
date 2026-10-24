# Outil de dev : envoie une ou plusieurs photos de cours à /extract (wrangler dev doit tourner).
# Le jeton est lu dans api/.dev.vars sans être affiché.
# Usage : .\api\scripts\try-extract.ps1 C:\chemin\photo1.jpg [C:\chemin\photo2.jpg ...]
param([Parameter(Mandatory)][string[]]$Photos)

Add-Type -AssemblyName System.Drawing

# Même traitement que l'appli fera à l'étape 4 : redressée, 1600 px max, JPEG
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

$devVars = Join-Path $PSScriptRoot '..\.dev.vars'
# @() : avec une seule ligne, Get-Content renvoie une chaîne et -match renverrait True
$token = (@(Get-Content $devVars) -match '^APP_TOKEN=') -replace '^APP_TOKEN=', ''
$images = @($Photos | ForEach-Object { @{ mediaType = 'image/jpeg'; data = ConvertTo-CompressedJpeg $_ } })
$body = [Text.Encoding]::UTF8.GetBytes((@{ images = $images } | ConvertTo-Json -Depth 4))

try {
  $start = Get-Date
  $response = Invoke-WebRequest 'http://localhost:8787/extract' -Method Post -Body $body -UseBasicParsing `
    -ContentType 'application/json; charset=utf-8' -Headers @{ Authorization = "Bearer $token" }
  # Décodage UTF-8 explicite : PowerShell 5.1 se trompe sur les accents sinon
  $result = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
  Write-Host "Titre : $($result.title)" -ForegroundColor Cyan
  Write-Host $result.text
  Write-Host ("(réponse en {0:N0} s)" -f ((Get-Date) - $start).TotalSeconds) -ForegroundColor DarkGray
} catch {
  Write-Host "Erreur : $($_.ErrorDetails.Message)" -ForegroundColor Red
} finally {
  Remove-Variable token
}
