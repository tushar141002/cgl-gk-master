Add-Type -AssemblyName System.Drawing

function New-RoundedRect([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon([int]$size, [string]$outPath, [bool]$maskable) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $green = [System.Drawing.ColorTranslator]::FromHtml("#166534")
  $brush = [System.Drawing.SolidBrush]::new($green)
  $inset = if ($maskable) { 0 } else { [Math]::Round($size * 0.02) }
  $rect = [System.Drawing.RectangleF]::new($inset, $inset, $size - 2 * $inset, $size - 2 * $inset)

  if ($maskable) {
    $graphics.FillRectangle($brush, $rect)
  } else {
    $radius = [Math]::Round($size * 0.22)
    $path = New-RoundedRect $rect $radius
    $graphics.FillPath($brush, $path)
    $path.Dispose()
  }

  $safe = if ($maskable) { $size * 0.2 } else { $size * 0.1 }
  $fontSize = ($size - 2 * $safe) * 0.48
  $font = [System.Drawing.Font]::new("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = [System.Drawing.RectangleF]::new($safe, $safe - $fontSize * 0.04, $size - 2 * $safe, $size - 2 * $safe)
  $graphics.DrawString("GK", $font, [System.Drawing.Brushes]::White, $textRect, $format)

  $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $font.Dispose()
  $format.Dispose()
  $brush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
New-Icon 192 (Join-Path $root "public/icon-192.png") $false
New-Icon 512 (Join-Path $root "public/icon-512.png") $false
New-Icon 512 (Join-Path $root "public/icon-maskable-512.png") $true
Write-Host "Generated PWA icons."
