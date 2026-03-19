$ErrorActionPreference = "Stop"

$REGION  = "us-east-1"
$ACCOUNT = "730335261767"

$REPO        = "librechat"
$CLUSTER     = "juristai-librechat-ecs-cluster"
$SERVICE     = "librechat-service"
$TASK_FAMILY = "librechat-task"

$LOCAL_IMAGE = "librechat-local"
$ECR_URI = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO"
$TASKDEF_PATH = "td-register-fixed.json"

Write-Host "===================================="
Write-Host "JuristAI LibreChat Deploy Starting"
Write-Host "===================================="
Write-Warning "GitHub Actions is the canonical ECS deploy path."
Write-Warning "This script is a manual fallback only and expects a fully rendered task definition."
Write-Warning "The checked-in $TASKDEF_PATH is sanitized and contains placeholders, not live secrets."

Set-Location "C:\Users\aibns\Git Projects\juristai\Chatbot"

# -----------------------------
# 0) HARD FAIL IF DOCKER DOWN
# -----------------------------
Write-Host ""
Write-Host "0) Checking Docker daemon..."

try {
    docker ps | Out-Null
} catch {
    Write-Error "Docker is NOT running. Start Docker Desktop."
    exit 1
}

Write-Host "Docker is running."

# -----------------------------
# 1) Verify ECR repo
# -----------------------------
Write-Host ""
Write-Host "1) Verifying ECR repository..."

aws ecr describe-repositories `
  --repository-names $REPO `
  --region $REGION | Out-Null

# -----------------------------
# 2) Login to ECR
# -----------------------------
Write-Host ""
Write-Host "2) Logging into AWS ECR..."

aws ecr get-login-password --region $REGION `
| docker login `
  --username AWS `
  --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

# -----------------------------
# 3) Build image
# -----------------------------
Write-Host ""
Write-Host "3) Building Docker image..."

docker build -t "${LOCAL_IMAGE}:latest" .

# -----------------------------
# 4) Tag image
# -----------------------------
Write-Host ""
Write-Host "4) Tagging image for ECR..."

docker tag "${LOCAL_IMAGE}:latest" "${ECR_URI}:latest"

# -----------------------------
# 5) Push image
# -----------------------------
Write-Host ""
Write-Host "5) Pushing image to ECR..."

docker push "${ECR_URI}:latest"

# -----------------------------
# 6) Register new task definition
# -----------------------------
Write-Host ""
Write-Host "6) Registering new task definition revision..."

if (!(Test-Path $TASKDEF_PATH)) {
    Write-Error "Task definition file not found: $TASKDEF_PATH"
    exit 1
}

$taskDefinitionRaw = Get-Content $TASKDEF_PATH -Raw
if ($taskDefinitionRaw.Contains("<github-")) {
    Write-Error "Task definition contains GitHub placeholder values. Render a real task definition before using this fallback script."
    exit 1
}

$task = aws ecs register-task-definition `
  --cli-input-json "file://$TASKDEF_PATH" `
  --region $REGION `
  | ConvertFrom-Json

$revision = $task.taskDefinition.revision

Write-Host "New revision: $revision"

# -----------------------------
# 7) Update ECS service (FIXED)
# -----------------------------
Write-Host ""
Write-Host "7) Updating ECS service..."

aws ecs update-service `
  --cluster $CLUSTER `
  --service $SERVICE `
  --task-definition "$TASK_FAMILY`:$revision" `
  --desired-count 2 `
  --force-new-deployment `
  --region $REGION | Out-Null

# -----------------------------
# 8) Wait for stability
# -----------------------------
Write-Host ""
Write-Host "8) Waiting for ECS service to stabilize..."

aws ecs wait services-stable `
  --cluster $CLUSTER `
  --services $SERVICE `
  --region $REGION

# -----------------------------
# 9) Show deployments
# -----------------------------
Write-Host ""
Write-Host "9) Current deployments..."

aws ecs describe-services `
  --cluster $CLUSTER `
  --services $SERVICE `
  --region $REGION `
  --query "services[0].deployments"

Write-Host ""
Write-Host "===================================="
Write-Host "Deploy COMPLETE & STABLE"
Write-Host "===================================="
