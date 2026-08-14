$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist-local"))
$address = "http://127.0.0.1:8000/"

if (-not (Test-Path -LiteralPath (Join-Path $siteRoot "index.html"))) {
  Write-Host "未找到可运行的网页文件，请先完成项目构建。" -ForegroundColor Red
  Read-Host "按回车键退出"
  exit 1
}

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".ico" = "image/x-icon"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($address)

try {
  $listener.Start()
  Write-Host "李去哪儿已启动：$address" -ForegroundColor Green
  Write-Host "请保持此窗口开启；关闭窗口即可停止网页。" -ForegroundColor DarkGray
  Start-Process $address

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relativePath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }
    $requestedPath = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $relativePath))

    if (-not $requestedPath.StartsWith($siteRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $requestedPath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($requestedPath)
    $extension = [System.IO.Path]::GetExtension($requestedPath).ToLowerInvariant()
    $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
} catch {
  Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Read-Host "按回车键退出"
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
