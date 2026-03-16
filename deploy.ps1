$ErrorActionPreference = "Stop"

$REGION  = "us-east-1"
$ACCOUNT = "730335261767"

$REPO        = "librechat"
$CLUSTER     = "juristai-librechat-ecs-cluster"
$SERVICE     = "librechat-service"
$TASK_FAMILY = "librechat-task"

$LOCAL_IMAGE = "librechat-local"
$ECR_URI = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO"
$TASKDEF_PATH = "taskdef.json"

Write-Host "===================================="
Write-Host "JuristAI LibreChat Deploy Starting"
Write-Host "===================================="

Set-Location "C:\Users\aibns\Git Projects\juristai\Chatbot"

Write-Host ""
Write-Host "1) Verifying ECR repository..."

aws ecr describe-repositories `
  --repository-names $REPO `
  --region $REGION | Out-Null

Write-Host ""
Write-Host "2) Logging into AWS ECR..."

aws ecr get-login-password --region $REGION `
| docker login `
  --username AWS `
  --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

Write-Host ""
Write-Host "3) Building Docker image..."

docker build -t "${LOCAL_IMAGE}:latest" .

Write-Host ""
Write-Host "4) Tagging image for ECR..."

docker tag "${LOCAL_IMAGE}:latest" "${ECR_URI}:latest"

Write-Host ""
Write-Host "5) Pushing image to ECR..."

docker push "${ECR_URI}:latest"

if (Test-Path $TASKDEF_PATH) {
    Write-Host ""
    Write-Host "6) Registering new task definition revision..."

    $task = aws ecs register-task-definition `
      --cli-input-json "file://$TASKDEF_PATH" `
      --region $REGION `
      | ConvertFrom-Json

    $revision = $task.taskDefinition.revision

    Write-Host "New revision: $revision"

    Write-Host ""
    Write-Host "7) Updating ECS service to new task definition..."

    aws ecs update-service `
      --cluster $CLUSTER `
      --service $SERVICE `
      --task-definition "$TASK_FAMILY`:$revision" `
      --force-new-deployment `
      --region $REGION | Out-Null
}
else {
    Write-Host ""
    Write-Host "6) No taskdef.json found. Reusing current task definition and forcing deployment..."

    aws ecs update-service `
      --cluster $CLUSTER `
      --service $SERVICE `
      --force-new-deployment `
      --region $REGION | Out-Null
}

Write-Host ""
Write-Host "8) Current deployments..."

aws ecs describe-services `
  --cluster $CLUSTER `
  --services $SERVICE `
  --region $REGION `
  --query "services[0].deployments"

Write-Host ""
Write-Host "===================================="
Write-Host "Deploy triggered successfully"
Write-Host "===================================="