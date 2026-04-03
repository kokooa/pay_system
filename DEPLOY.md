# AWS EC2 배포 가이드

## 사전 준비
- AWS 계정
- GitHub에 프로젝트 코드 push 완료

---

## Step 1. EC2 인스턴스 생성

### AWS 콘솔에서 EC2 생성

1. AWS 콘솔 → EC2 → **인스턴스 시작**
2. 아래 설정으로 생성:

| 항목 | 값 |
|------|------|
| 이름 | `pay-system` |
| AMI | **Amazon Linux 2023** (프리티어) |
| 인스턴스 유형 | **t3.medium** (Kafka 때문에 최소 4GB RAM 필요) |
| 키 페어 | 새로 생성하거나 기존 것 선택 (.pem 파일 다운로드) |
| 스토리지 | **20 GiB** (gp3) |

> **주의**: t2.micro(프리티어)는 RAM 1GB라 Kafka가 실행 안 됩니다. t3.medium(4GB)을 추천합니다.
> 비용: 약 $0.05/시간 ≈ 월 ~$37. 테스트 후 중지하면 비용 절감 가능.

### 보안 그룹 설정

인바운드 규칙에 다음 포트를 추가합니다:

| 포트 | 프로토콜 | 소스 | 용도 |
|------|---------|------|------|
| 22 | TCP | 내 IP | SSH 접속 |
| 3000 | TCP | 0.0.0.0/0 | NestJS API |
| 8080 | TCP | 0.0.0.0/0 | Kafka UI |

3. **인스턴스 시작** 클릭

---

## Step 2. EC2 접속

```bash
# 키 파일 권한 설정 (최초 1회)
chmod 400 your-key.pem

# SSH 접속
ssh -i your-key.pem ec2-user@<EC2-공인-IP>
```

---

## Step 3. 서버 초기 설정

EC2에 접속한 후 아래 명령어를 순서대로 실행합니다.

### 3-1. 시스템 업데이트
```bash
sudo dnf update -y
```

### 3-2. Docker 설치
```bash
# Docker 설치
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker

# Docker Compose 플러그인 설치
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m) -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 사용)
sudo usermod -aG docker $USER

# 그룹 변경 적용 (재접속 대신)
newgrp docker

# 설치 확인
docker --version
docker compose version
```

### 3-3. Git 설치 & 코드 클론
```bash
sudo dnf install -y git

# 프로젝트 클론 (본인의 GitHub 리포 URL로 변경)
git clone https://github.com/<YOUR_USERNAME>/pay_system.git
cd pay_system
```

---

## Step 4. 배포

### 4-1. 환경변수 설정
```bash
# JWT 시크릿 키 설정 (반드시 변경!)
export JWT_SECRET="your-production-secret-key-$(openssl rand -hex 16)"
echo "JWT_SECRET=$JWT_SECRET" >> ~/.bashrc
```

### 4-2. 배포 실행
```bash
# 배포 스크립트 실행
./scripts/deploy.sh
```

또는 수동으로:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4-3. 상태 확인
```bash
# 전체 컨테이너 상태 확인
docker compose -f docker-compose.prod.yml ps

# 앱 로그 확인
docker logs pay-app -f

# 모든 서비스가 healthy인지 확인 (약 30초~1분 소요)
```

---

## Step 5. 접속 확인

브라우저에서 확인:
```
Swagger API 문서: http://<EC2-공인-IP>:3000/api-docs
Kafka UI:        http://<EC2-공인-IP>:8080
```

API 테스트:
```bash
# 회원가입
curl -X POST http://<EC2-공인-IP>:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Password1!","name":"홍길동","phone":"010-1234-5678"}'
```

---

## 운영 명령어 모음

```bash
# 로그 확인
docker logs pay-app -f          # 앱 로그
docker logs pay-mysql -f        # MySQL 로그
docker logs pay-kafka -f        # Kafka 로그

# 재시작
docker compose -f docker-compose.prod.yml restart app

# 전체 중지 (비용 절감 시)
docker compose -f docker-compose.prod.yml down

# 전체 시작
docker compose -f docker-compose.prod.yml up -d

# DB 데이터까지 초기화
docker compose -f docker-compose.prod.yml down -v
```

---

## 비용 절감 팁

- **사용하지 않을 때는 EC2 인스턴스를 중지**하세요 (Stop). 중지 중에는 인스턴스 비용이 발생하지 않습니다.
- 단, 중지 후 재시작하면 공인 IP가 변경됩니다. 고정하려면 **탄력적 IP(Elastic IP)**를 할당하세요 (연결된 인스턴스가 실행 중이면 무료).
- 포트폴리오 면접 전에만 인스턴스를 시작하고, 면접이 끝나면 중지하는 방식을 추천합니다.

---

## 문제 해결

### 앱이 시작되지 않을 때
```bash
# 로그 확인
docker logs pay-app

# MySQL이 먼저 준비되었는지 확인
docker logs pay-mysql
```

### 메모리 부족
```bash
# 메모리 확인
free -h

# Swap 추가 (RAM이 부족할 때)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Kafka 연결 실패
```bash
# Kafka 상태 확인
docker logs pay-kafka

# 토픽 목록 확인
docker exec pay-kafka kafka-topics --bootstrap-server localhost:9092 --list
```
