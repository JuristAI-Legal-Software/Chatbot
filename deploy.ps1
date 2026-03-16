$ErrorActionPreference = "Stop"

$REGION = "us-east-1"
$ACCOUNT = "730335261767"

$REPO = "juristai-librechat"
$CLUSTER = "juristai-librechat-ecs-cluster"
$SERVICE = "librechat-service"
$TASK_FAMILY = "librechat-task"

$ECR_URI = "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO"

Write-Host "===================================="
Write-Host "JuristAI LibreChat Deploy Starting"
Write-Host "===================================="

cd "C:\Users\aibns\Git Projects\juristai\Chatbot"

Write-Host ""
Write-Host "1️⃣ Building Docker image..."

docker build -t $REPO .

Write-Host ""
Write-Host "2️⃣ Logging into AWS ECR..."

aws ecr get-login-password --region $REGION `
| docker login `
--username AWS `
--password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

Write-Host ""
Write-Host "3️⃣ Tagging image..."

docker tag "$REPO`:latest" "$ECR_URI`:latest"

Write-Host ""
Write-Host "4️⃣ Pushing image to ECR..."

docker push "$ECR_URI`:latest"

Write-Host ""
Write-Host "5️⃣ Registering new task definition..."

$task = aws ecs register-task-definition `
--cli-input-json file://taskdef.json `
--region $REGION `
| ConvertFrom-Json

$revision = $task.taskDefinition.revision

Write-Host "New revision: $revision"

Write-Host ""
Write-Host "6️⃣ Updating ECS service..."

aws ecs update-service `
--cluster $CLUSTER `
--service $SERVICE `
--task-definition "$TASK_FAMILY`:$revision" `
--region $REGION

Write-Host ""
Write-Host "7️⃣ Forcing fresh deployment..."

aws ecs update-service `
--cluster $CLUSTER `
--service $SERVICE `
--force-new-deployment `
--region $REGION

Write-Host ""
Write-Host "===================================="
Write-Host "Deploy Complete"
Write-Host "===================================="