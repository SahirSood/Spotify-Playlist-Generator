# build-and-deploy.ps1
# Run from the backend-python directory:  .\build-and-deploy.ps1

$ErrorActionPreference = "Stop"

Write-Host "==> Cleaning up..."
Remove-Item -Force layers\sklearn-layer.zip -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force python -ErrorAction SilentlyContinue
if (-not (Test-Path "layers")) { New-Item -ItemType Directory -Path "layers" | Out-Null }

# Write the zip-creation logic to a temp Python file (avoids shell quoting nightmares)
Set-Content -Path "make_layer_zip.py" -Encoding UTF8 -Value @'
import zipfile, os

# Skip dirs and file types that are not needed at runtime (~100MB+ savings)
SKIP_DIRS = {'tests', 'test', 'testing', 'benchmarks', '__pycache__'}
SKIP_EXTS = {'.pyx', '.pxd', '.pyc', '.pyo'}

out = '/var/task/layers/sklearn-layer.zip'
src = '/tmp/python'
total = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            if os.path.splitext(fname)[1] in SKIP_EXTS:
                continue
            full = os.path.join(root, fname)
            arcname = 'python/' + os.path.relpath(full, src)
            z.write(full, arcname)
            total += os.path.getsize(full)
print(f'Layer zip created at {out}  (unzipped content: {total/1e6:.1f} MB)')
'@

Write-Host "==> Building Python packages inside Docker (Linux-compatible paths)..."
docker run --rm `
    --entrypoint /bin/bash `
    -v "${PWD}:/var/task" `
    public.ecr.aws/lambda/python:3.11 `
    -c "pip install -r /var/task/requirements.txt -t /tmp/python -q && python3 /var/task/make_layer_zip.py"

Remove-Item -Force make_layer_zip.py -ErrorAction SilentlyContinue

if (-not (Test-Path "layers\sklearn-layer.zip")) {
    Write-Error "Layer zip was not created. Check Docker output above."
    exit 1
}

$sizeMB = [math]::Round((Get-Item "layers\sklearn-layer.zip").Length / 1MB, 1)
Write-Host "==> Layer zip: $sizeMB MB"

Write-Host "==> Deploying to AWS..."
npx serverless@3 deploy --stage dev --region us-east-1

$payload = '{"action":"run_clustering"}'
Write-Host ""
Write-Host "==> Done! Trigger clustering manually with:"
Write-Host "    aws lambda invoke --function-name spotify-ml-pipeline-dev-mlPipeline --cli-binary-format raw-in-base64-out --payload '$payload' response.json"
Write-Host "    Get-Content response.json"
