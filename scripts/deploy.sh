#!/bin/bash
set -e

echo "===== PaySystem 배포 시작 ====="

# 최신 코드 가져오기
echo "[1/4] 코드 업데이트..."
git pull origin main

# 이미지 빌드
echo "[2/4] Docker 이미지 빌드..."
docker compose -f docker-compose.prod.yml build --no-cache app

# 기존 컨테이너 중지 & 새로 시작
echo "[3/4] 컨테이너 재시작..."
docker compose -f docker-compose.prod.yml up -d

# 불필요한 이미지 정리
echo "[4/4] 정리..."
docker image prune -f

echo "===== 배포 완료 ====="
echo "API:     http://$(curl -s ifconfig.me):3000/api-docs"
echo "Kafka UI: http://$(curl -s ifconfig.me):8080"
