Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\26050031\.gemini\antigravity-ide\brain\7efebd5f-2ae9-4552-bfc1-373c2d65be5f\.user_uploaded\media_1793270783901.png"
$assetsDir = "c:\Users\26050031\Desktop\Knome\knome\Knome main\knomeUI\frontend\src\assets"
$publicDir = "c:\Users\26050031\Desktop\Knome\knome\Knome main\knomeUI\frontend\public"

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source image not found: $sourcePath"
    exit 1
}

$rawBmp = [System.Drawing.Bitmap]::FromFile($sourcePath)
$origW = $rawBmp.Width
$origH = $rawBmp.Height

# 1. Detect content bounding box (trim excess top/bottom/left/right whitespace)
$minX = $origW; $maxX = 0; $minY = $origH; $maxY = 0
for ($x = 0; $x -lt $origW; $x++) {
    for ($y = 0; $y -lt $origH; $y++) {
        $p = $rawBmp.GetPixel($x, $y)
        $isContent = ($p.A -gt 25) -and -not ($p.R -gt 250 -and $p.G -gt 250 -and $p.B -gt 250)
        if ($isContent) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

# Add 4px margin
$pad = 4
$cropX = [Math]::Max(0, $minX - $pad)
$cropY = [Math]::Max(0, $minY - $pad)
$cropW = [Math]::Min($origW - $cropX, ($maxX - $minX) + ($pad * 2))
$cropH = [Math]::Min($origH - $cropY, ($maxY - $minY) + ($pad * 2))

Write-Host "Cropping raw logo from ${origW}x${origH} to tight box ${cropW}x${cropH}" -ForegroundColor Cyan

$cropRect = new-object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$bmp = $rawBmp.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$rawBmp.Dispose()

$width = $bmp.Width
$height = $bmp.Height

# Save trimmed Light Mode logo
$lightLogoPath = Join-Path $assetsDir "knome_logo.png"
$techLogoPath = Join-Path $assetsDir "technosocial_logo.png"
$pubLogoPath = Join-Path $publicDir "technosocial_logo.png"
$bmp.Save($lightLogoPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($techLogoPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($pubLogoPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved trimmed light logo to knome_logo.png and technosocial_logo.png" -ForegroundColor Green

# 2. Generate Dark Mode logo (turn dark navy/gray text into crisp white)
$darkBmp = new-object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($x = 0; $x -lt $width; $x++) {
    for ($y = 0; $y -lt $height; $y++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 10) {
            # Background white -> transparent in dark mode
            if ($p.R -gt 245 -and $p.G -gt 245 -and $p.B -gt 245) {
                $darkBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
            }
            # Dark navy "Techno" -> white
            elseif ($p.R -lt 55 -and $p.G -lt 65 -and $p.B -lt 110) {
                $darkBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, 255, 255, 255))
            }
            # Gray tagline -> slate-200
            elseif ($p.R -lt 120 -and $p.G -lt 130 -and $p.B -lt 140 -and [Math]::Abs($p.R - $p.G) -lt 15 -and [Math]::Abs($p.G - $p.B) -lt 15) {
                $darkBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, 226, 232, 240))
            }
            else {
                $darkBmp.SetPixel($x, $y, $p)
            }
        } else {
            $darkBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        }
    }
}
$darkLogoPath = Join-Path $assetsDir "knome_logo_dark.png"
$darkLogoTechPath = Join-Path $assetsDir "technosocial_logo_dark.png"
$darkBmp.Save($darkLogoPath, [System.Drawing.Imaging.ImageFormat]::Png)
$darkBmp.Save($darkLogoTechPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved dark logo with crisp white lettering" -ForegroundColor Green

# 3. Crop isolated stylized 'T' Emblem (left ~28% of trimmed image)
$emblemW = [int]($width * 0.285)
$emblemRect = new-object System.Drawing.Rectangle(0, 0, $emblemW, $height)
$emblemRaw = $bmp.Clone($emblemRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Make emblem square with centered graphic and transparent background
$sqSize = [Math]::Max($emblemW, $height)
$emblemSquare = new-object System.Drawing.Bitmap($sqSize, $sqSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gSq = [System.Drawing.Graphics]::FromImage($emblemSquare)
$gSq.Clear([System.Drawing.Color]::Transparent)
$offX = [int](($sqSize - $emblemW) / 2)
$offY = [int](($sqSize - $height) / 2)
$gSq.DrawImage($emblemRaw, $offX, $offY, $emblemW, $height)
$gSq.Dispose()
$emblemRaw.Dispose()

# Resize helper
function Save-Resized($src, $w, $h, $destPath) {
    $target = new-object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($target)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $w, $h)
    $target.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $target.Dispose()
}

Save-Resized $emblemSquare 180 180 (Join-Path $publicDir "apple-touch-icon.png")
Save-Resized $emblemSquare 64 64 (Join-Path $publicDir "favicon.png")
Save-Resized $emblemSquare 32 32 (Join-Path $publicDir "favicon-32x32.png")
Save-Resized $emblemSquare 16 16 (Join-Path $publicDir "favicon-16x16.png")
Save-Resized $emblemSquare 180 180 (Join-Path $publicDir "knome_emblem.png")
Save-Resized $emblemSquare 180 180 (Join-Path $assetsDir "knome_k_emblem.png")

# Also write direct .ico
$icoTarget = new-object System.Drawing.Bitmap(32, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gIco = [System.Drawing.Graphics]::FromImage($icoTarget)
$gIco.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gIco.DrawImage($emblemSquare, 0, 0, 32, 32)
$icoHandle = $icoTarget.GetHicon()
$icoObj = [System.Drawing.Icon]::FromHandle($icoHandle)
$icoStream = [System.IO.File]::OpenWrite((Join-Path $publicDir "favicon.ico"))
$icoObj.Save($icoStream)
$icoStream.Close()
$gIco.Dispose()
$icoTarget.Dispose()

# Remove outdated favicon.svg so browsers never fall back to old Knome K SVG
$svgFavicon = Join-Path $publicDir "favicon.svg"
if (Test-Path $svgFavicon) {
    Remove-Item -Force $svgFavicon
}

Write-Host "Replaced favicon.ico, removed old favicon.svg, and deployed all favicons!" -ForegroundColor Green

$darkBmp.Dispose()
$emblemSquare.Dispose()
$bmp.Dispose()
Write-Host "ALL TECHNOSOCIAL ASSETS OPTIMIZED AND DEPLOYED!" -ForegroundColor Cyan
