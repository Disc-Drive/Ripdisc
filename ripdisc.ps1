param(
    [string]$discName,
    [string]$driveLetter,
    [string]$destinationType,
    [string]$localPath,
    [string]$nasPath,
    [bool]$IsTV
)

# Config

$MakeMKV   = "C:\Program Files (x86)\MakeMKV\makemkvcon64.exe"
$HandBrake = "C:\Program Files\HandBrake\HandBrakeCLI.exe"
$WinSCP    = "C:\Program Files (x86)\WinSCP\WinSCP.com"

$StateRoot = "C:\Rips\State"
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

# FORCE selected drive (no auto ambiguity)
$DriveLetter = ($driveLetter.TrimEnd(":")) + ":"

$TempMKVRoot = "C:\Rips\MKV"
$TempMP4Root = "C:\Rips\Final"

# Verify Disc

if (-not (Test-Path "$DriveLetter\")) {
    Write-Host "No disc detected in drive $DriveLetter"
    exit
}

$rawLabel    = (Get-Volume -DriveLetter $DriveLetter.TrimEnd(":")).FileSystemLabel
$defaultName = ($rawLabel -replace '[^\w\s\-\(\)]','').Trim()

Write-Host ""
Write-Host "Disc detected: $rawLabel"

if (-not $discName) {
    $discName = $defaultName
}

Write-Host ""
Write-Host "Final name: $discName"

# TV setup

if ($IsTV) {
    $seasonNum = 1
    $seasonStr = "{0:D2}" -f [int]$seasonNum
    $stateFile = Join-Path $StateRoot "$discName`_S$seasonStr.txt"

    if (Test-Path $stateFile) {
        $last = Get-Content $stateFile
        $episodeNum = [int]$last + 1
    } else {
        $episodeNum = 1
    }
}

# Destination

if ($destinationType -eq "nas") {
    $remoteUploadPath = $nasPath
} else {
    $remoteUploadPath = $localPath
}

if (-not $remoteUploadPath) {
    Write-Host "No upload destination set"
    exit
}

# Cleanup

Get-ChildItem $TempMKVRoot -Directory -EA SilentlyContinue |
    Where-Object { $_.Name -ne $discName } |
    Remove-Item -Recurse -Force

Get-ChildItem $TempMP4Root -Directory -EA SilentlyContinue |
    Where-Object { $_.Name -ne $discName } |
    Remove-Item -Recurse -Force

# Paths

$MKVDir = Join-Path $TempMKVRoot $discName
$MP4Dir = Join-Path $TempMP4Root $discName

New-Item -ItemType Directory -Force -Path $MKVDir, $MP4Dir | Out-Null

# MakeMKV (scan + rip using fixed index)

$mkvFiles = Get-ChildItem $MKVDir -Filter *.mkv -EA SilentlyContinue

if (-not $mkvFiles) {

    & $MakeMKV -r info "dev:$DriveLetter" | Out-Null

    & $MakeMKV --robot --progress=-same `
        mkv "dev:$DriveLetter" all "$MKVDir" `
        --minlength=3600

    $mkvFiles = Get-ChildItem $MKVDir -Filter *.mkv -EA SilentlyContinue

    if (-not $mkvFiles) {
        Write-Host "MakeMKV produced no MKV files."
        exit
    }
}

# Process MKVs

if ($IsTV) {
    $lastWritten = $null
}

foreach ($mainMKV in $mkvFiles) {

    if ($IsTV) {
        $epTag = "S{0:D2}E{1:D2}" -f [int]$seasonNum, [int]$episodeNum
        $mp4Path = Join-Path $MP4Dir "$discName $epTag.mp4"
    } else {
        $mp4Path = Join-Path $MP4Dir "$discName.mp4"
    }

    if (Test-Path $mp4Path) {
        continue
    }

    $hbArgs = @(
        "-i", "`"$($mainMKV.FullName)`"",
        "-o", "`"$mp4Path`"",
        "--encoder", "nvenc_h265",
        "--quality", "18",
        "--vfr",
        "--width", "1920",
        "--height", "1080",
        "--keep-display-aspect",
        "--audio", "1",
        "--subtitle", "foreign",
        "--markers"
    )

    Start-Process $HandBrake -ArgumentList ($hbArgs -join ' ') -NoNewWindow -Wait

    if (-not (Test-Path $mp4Path)) {
        Write-Host "HandBrake failed on $($mainMKV.Name)."
        exit
    }

    if ($IsTV) {
        $lastWritten = $episodeNum
        $episodeNum++
    }
}

if ($IsTV -and $lastWritten) {
    Set-Content -Path $stateFile -Value $lastWritten
}

# Upload

$scp = @"
option batch abort
option confirm off
open sftp://disc_drive@pi-nas/ -privatekey="C:\Users\zacke\.ssh\pi_drive_ed25519.ppk" -hostkey=* -rawsettings AddressFamily=inet
lcd "$MP4Dir"
put *.mp4 "$remoteUploadPath/"
exit
"@

$scpFile = "$env:TEMP\winscp_rip.txt"
$scp | Set-Content $scpFile -Encoding ASCII

& $WinSCP /ini=nul /script="$scpFile"

if ($LASTEXITCODE -ne 0) {
    Write-Host "WinSCP upload failed."
    exit
}

Remove-Item $MKVDir -Recurse -Force
Remove-Item $MP4Dir -Recurse -Force

# Eject

$drive = $DriveLetter.TrimEnd(":") + ":"

(New-Object -ComObject Shell.Application).
    NameSpace(17).
    ParseName($drive).
    InvokeVerb("Eject")