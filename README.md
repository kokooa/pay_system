# PaySystem - 간편결제 시스템

토스/카카오페이 스타일의 간편결제 백엔드 시스템입니다.
결제 요청부터 승인, 정산까지의 전체 플로우를 구현하며, 트랜잭션 안전성과 장애 복구에 중점을 둡니다.

## Tech Stack

| 분류 | 기술 |
|------|------|
| Framework | NestJS (TypeScript) |
| Database | MySQL 8.0 + TypeORM |
| Cache | Redis 7 |
| Message Queue | Apache Kafka |
| Auth | JWT (Access + Refresh Token) |
| Docs | Swagger (OpenAPI) |
| Infra | Docker Compose |

## 핵심 기능

### 결제 플로우
```
결제 요청 → 멱등성 검증(Redis) → DB 저장 + Outbox 저장(트랜잭션)
→ Kafka 발행 → Consumer 결제 승인(분산락 + 낙관적 락) → 거래내역 생성
```

### 안정성 확보
- **중복 결제 방지** - Redis 멱등성 키 (SETNX, TTL 24h)
- **동시성 제어** - Redis 분산락 (Lua 스크립트) + TypeORM 낙관적 락 (@VersionColumn)
- **잔액 관리** - 결제 승인 시 차감, 취소 시 복원 (트랜잭션 내 원자적 처리)
- **메시지 유실 방지** - Transactional Outbox 패턴 (DB + Kafka 원자적 보장)
- **장애 복구** - Kafka 재시도 (3회) → DLQ (Dead Letter Queue)
- **트랜잭션 롤백** - TypeORM QueryRunner 기반 수동 트랜잭션 관리

## 프로젝트 구조

```
src/
├── auth/           # 인증 (회원가입, 로그인, JWT)
├── user/           # 사용자 관리
├── account/        # 계좌 등록/관리
├── payment/        # 결제 요청/승인/취소 (핵심)
├── transaction/    # 거래내역 조회
├── settlement/     # 정산 (일일 배치)
├── redis/          # Redis 모듈 (멱등성 키, 분산락)
├── kafka/          # Kafka Producer
└── common/         # 예외 필터, 인터셉터, 데코레이터
```

## API 엔드포인트

### Auth
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/auth/signup` | 회원가입 |
| POST | `/api/v1/auth/login` | 로그인 |
| POST | `/api/v1/auth/refresh` | 토큰 갱신 |

### Account
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/accounts` | 계좌 등록 |
| GET | `/api/v1/accounts` | 내 계좌 목록 |
| PATCH | `/api/v1/accounts/:id/default` | 기본 계좌 설정 |
| DELETE | `/api/v1/accounts/:id` | 계좌 삭제 |

### Payment
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/payments` | 결제 요청 (idempotency-key 필수, 최대 1,000만원) |
| POST | `/api/v1/payments/:paymentKey/cancel` | 결제 취소 |
| GET | `/api/v1/payments/:paymentKey` | 결제 상세 조회 |

### Transaction
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/transactions` | 거래내역 목록 (페이징, 필터) |
| GET | `/api/v1/transactions/:id` | 거래내역 상세 |

### Settlement
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/settlements` | 정산 내역 목록 |
| GET | `/api/v1/settlements/:id` | 정산 상세 |

## 실행 방법

### 1. 인프라 실행

```bash
docker compose up -d
```

MySQL(3306), Redis(6379), Kafka(9092), Kafka UI(8080) 가 실행됩니다.

### 2. 의존성 설치

```bash
pnpm install
```

### 3. 환경변수 설정

```bash
cp .env.example .env
```

### 4. 서버 실행

```bash
# 개발 모드 (watch)
pnpm run start:dev

# 프로덕션 빌드
pnpm run build
pnpm run start:prod
```

### 5. API 문서 확인

서버 실행 후 브라우저에서 접속:
```
http://localhost:3000/api-docs
```

## 테스트 시나리오

### 결제 플로우 테스트
```bash
# 1. 회원가입
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Password1!","name":"홍길동","phone":"010-1234-5678"}'

# 2. 로그인 → accessToken 획득
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Password1!"}'

# 3. 계좌 등록
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"bankCode":"004","accountNumber":"123-456-789","accountHolder":"홍길동","isDefault":true}'

# 4. 결제 요청
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: test-key-001" \
  -d '{"accountId":1,"orderId":"ORDER-001","amount":50000}'

# 5. 거래내역 조회
curl http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### 중복 결제 방지 테스트
동일한 `idempotency-key`로 2회 요청 시 첫 번째 결제 결과가 반환됩니다.

### 동시성 테스트
동일 주문에 대해 동시 요청 시 Redis 분산락으로 1건만 처리됩니다.

## 아키텍처 다이어그램

```
┌──────────┐     ┌──────────────┐     ┌─────────┐
│  Client  │────▶│  Controller  │────▶│  Redis  │ 멱등성 체크
└──────────┘     └──────┬───────┘     └─────────┘
                        │
                        ▼
                 ┌──────────────┐     ┌─────────┐
                 │   Service    │────▶│  MySQL  │ Payment + Outbox 저장
                 └──────┬───────┘     └─────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │    Kafka     │ payment.requested 토픽
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐     ┌─────────┐
                 │   Consumer   │────▶│  Redis  │ 분산락 획득
                 └──────┬───────┘     └─────────┘
                        │
                   ┌────┴────┐
                   ▼         ▼
              [승인 성공]  [실패 → 재시도 3회 → DLQ]
```

## Docker Compose 서비스

| 서비스 | 포트 | 설명 |
|--------|------|------|
| pay-mysql | 3306 | MySQL 8.0 |
| pay-redis | 6379 | Redis 7 |
| pay-kafka | 9092 | Apache Kafka |
| pay-zookeeper | 2181 | Zookeeper |
| pay-kafka-ui | 8080 | Kafka UI (모니터링) |

## DB 스키마

- **users** - 사용자
- **accounts** - 계좌 (1:N with users, balance 잔액 관리)
- **payments** - 결제 (멱등성 키, 낙관적 락 version, userId+orderId 복합 유니크)
- **transactions** - 거래내역
- **settlements** - 정산
- **payment_outbox** - Transactional Outbox (Kafka 발행 보장)
