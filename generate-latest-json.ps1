$version = "0.4.0"
$pubDate = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
$repo = "eszuri/symvonia"

$msiSig = Get-Content "src-tauri\target\release\bundle\msi\Symvonia_${version}_x64_en-US.msi.sig"
$nsisSig = Get-Content "src-tauri\target\release\bundle\nsis\Symvonia_${version}_x64-setup.exe.sig"

$json = @{
    version = $version
    notes = "Release $version"
    pub_date = $pubDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $msiSig
            url = "https://github.com/$repo/releases/download/v$version/Symvonia_${version}_x64_en-US.msi"
        }
    }
} | ConvertTo-Json -Depth 4

$json | Out-File -FilePath "src-tauri\target\release\bundle\latest.json" -Encoding UTF8
Write-Host "Generated: src-tauri\target\release\bundle\latest.json"
