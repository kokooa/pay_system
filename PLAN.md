# 간편결제 시스템 (PaySystem) - 구현 계획서

## Context
핀테크 신입 백엔드 개발자 포트폴리오용 간편결제 시스템.
트랜잭션 안전성, 동시성 제어, 장애 복구 등 핀테크 핵심 역량을 코드로 증명하는 것이 목표.

## Tech Stack
- **Framework**: NestJS (TypeScript)
- **DB**: MySQL + TypeORM
- **Cache**: Redis (중복결제 방지, 분산락)
- **MQ**: Kafka (비동기 결제 처리, 재처리)
- **Infra**: Docker Compose
- **Docs**: Swagger (OpenAPI)
- **Auth**: JWT (Access + Refresh Token)

---

## 1. 프로젝트 구조

```
pay_system/
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── nest-cli.json
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/                    # 공통 모듈
│   │   ├── decorators/            # 커스텀 데코레이터
│   │   ├── filters/               # 예외 필터
│   │   ├── guards/                # 인증 가드
│   │   ├── interceptors/          # 로깅, 응답 변환
│   │   ├── interfaces/            # 공통 인터페이스
│   │   └── utils/                 # 유틸리티
│   ├── config/                    # 설정 모듈
│   │   └── config.module.ts
│   ├── auth/                      # 인증 모듈
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/            # JWT, Local strategy
│   │   └── dto/
│   ├── user/                      # 사용자 모듈
│   │   ├── user.module.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   ├── entities/
│   │   │   └── user.entity.ts
│   │   └── dto/
│   ├── account/                   # 계좌 모듈
│   │   ├── account.module.ts
│   │   ├── account.controller.ts
│   │   ├── account.service.ts
│   │   ├── entities/
│   │   │   └── account.entity.ts
│   │   └── dto/
│   ├── payment/                   # 결제 모듈 (핵심)
│   │   ├── payment.module.ts
│   │   ├── payment.controller.ts
│   │   ├── payment.service.ts
│   │   ├── payment.producer.ts    # Kafka Producer
│   │   ├── payment.consumer.ts    # Kafka Consumer
│   │   ├── entities/
│   │   │   └── payment.entity.ts
│   │   └── dto/
│   ├── transaction/               # 거래내역 모듈
│   │   ├── transaction.module.ts
│   │   ├── transaction.controller.ts
│   │   ├── transaction.service.ts
│   │   ├── entities/
│   │   │   └── transaction.entity.ts
│   │   └── dto/
│   ├── settlement/                # 정산 모듈
│   │   ├── settlement.module.ts
│   │   ├── settlement.service.ts
│   │   ├── settlement.scheduler.ts  # 정산 배치 (Cron)
│   │   ├── entities/
│   │   │   └── settlement.entity.ts
│   │   └── dto/
│   ├── redis/                     # Redis 모듈
│   │   ├── redis.module.ts
│   │   └── redis.service.ts       # 멱등성 키, 분산락
│   └── kafka/                     # Kafka 모듈
│       ├── kafka.module.ts
│       ├── kafka.producer.ts
│       └── kafka.consumer.ts
└── test/
    ├── unit/
    └── e2e/
```

---

## 2. 데이터베이스 스키마

### users
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | 사용자 ID |
| email | VARCHAR(255) UNIQUE | 이메일 |
| password | VARCHAR(255) | 해시된 비밀번호 |
| name | VARCHAR(100) | 이름 |
| phone | VARCHAR(20) | 전화번호 |
| status | ENUM('ACTIVE','SUSPENDED','DELETED') | 상태 |
| created_at | DATETIME | 생성일 |
| updated_at | DATETIME | 수정일 |

### accounts (계좌)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | 계좌 ID |
| user_id | BIGINT FK | 사용자 ID |
| bank_code | VARCHAR(10) | 은행코드 |
| account_number | VARCHAR(50) | 계좌번호 (암호화) |
| account_holder | VARCHAR(100) | 예금주 |
| is_default | BOOLEAN | 기본계좌 여부 |
| is_verified | BOOLEAN | 인증 여부 |
| status | ENUM('ACTIVE','INACTIVE') | 상태 |
| created_at | DATETIME | 생성일 |

### payments (결제)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | 결제 ID |
| payment_key | VARCHAR(64) UNIQUE | 결제 고유키 (외부 노출용) |
| idempotency_key | VARCHAR(64) UNIQUE | 멱등성 키 |
| user_id | BIGINT FK | 사용자 ID |
| account_id | BIGINT FK | 출금 계좌 ID |
| order_id | VARCHAR(64) | 주문 ID |
| amount | DECIMAL(15,2) | 결제 금액 |
| status | ENUM('PENDING','PROCESSING','APPROVED','FAILED','CANCELLED','REFUNDED') | 상태 |
| failure_reason | VARCHAR(500) | 실패 사유 |
| approved_at | DATETIME | 승인 시각 |
| version | INT | 낙관적 락 버전 |
| created_at | DATETIME | 생성일 |
| updated_at | DATETIME | 수정일 |

### transactions (거래내역)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | 거래 ID |
| payment_id | BIGINT FK | 결제 ID |
| user_id | BIGINT FK | 사용자 ID |
| type | ENUM('PAYMENT','REFUND','CANCEL') | 거래 유형 |
| amount | DECIMAL(15,2) | 거래 금액 |
| balance_after | DECIMAL(15,2) | 거래 후 잔액 |
| description | VARCHAR(500) | 거래 설명 |
| created_at | DATETIME | 생성일 |

### settlements (정산)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | 정산 ID |
| merchant_id | VARCHAR(64) | 가맹점 ID |
| settlement_date | DATE | 정산일 |
| total_amount | DECIMAL(15,2) | 정산 총액 |
| fee_amount | DECIMAL(15,2) | 수수료 |
| net_amount | DECIMAL(15,2) | 실정산액 |
| status | ENUM('PENDING','COMPLETED','FAILED') | 상태 |
| created_at | DATETIME | 생성일 |

### payment_outbox (Transactional Outbox 패턴)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | ID |
| aggregate_type | VARCHAR(50) | 도메인 타입 |
| aggregate_id | BIGINT | 도메인 ID |
| event_type | VARCHAR(100) | 이벤트 타입 |
| payload | JSON | 이벤트 데이터 |
| is_published | BOOLEAN | 발행 여부 |
| created_at | DATETIME | 생성일 |

---

## 3. API 설계

### Auth
| Method | Path | 설명 |
|--------|------|------|
| POST | /api/v1/auth/signup | 회원가입 |
| POST | /api/v1/auth/login | 로그인 (JWT 발급) |
| POST | /api/v1/auth/refresh | 토큰 갱신 |

### Account
| Method | Path | 설명 |
|--------|------|------|
| POST | /api/v1/accounts | 계좌 등록 |
| GET | /api/v1/accounts | 내 계좌 목록 |
| PATCH | /api/v1/accounts/:id/default | 기본 계좌 설정 |
| DELETE | /api/v1/accounts/:id | 계좌 삭제 |

### Payment
| Method | Path | 설명 |
|--------|------|------|
| POST | /api/v1/payments | 결제 요청 |
| POST | /api/v1/payments/:paymentKey/approve | 결제 승인 |
| POST | /api/v1/payments/:paymentKey/cancel | 결제 취소 |
| GET | /api/v1/payments/:paymentKey | 결제 상세 조회 |

### Transaction
| Method | Path | 설명 |
|--------|------|------|
| GET | /api/v1/transactions | 거래내역 목록 (페이징, 필터) |
| GET | /api/v1/transactions/:id | 거래내역 상세 |

### Settlement
| Method | Path | 설명 |
|--------|------|------|
| GET | /api/v1/settlements | 정산 내역 목록 |
| GET | /api/v1/settlements/:id | 정산 상세 |

---

## 4. 핵심 결제 플로우

```
[클라이언트] → POST /payments (idempotency-key 헤더)
     │
     ▼
[PaymentController]
     │
     ▼
[Redis] ── 멱등성 키 확인 (SETNX, TTL 24h)
     │       중복이면 → 기존 결과 반환
     ▼
[PaymentService]
     │  1. Payment 레코드 생성 (status: PENDING)
     │  2. Outbox 테이블에 이벤트 저장 (같은 트랜잭션)
     │
     ▼
[Outbox Relay] ── Outbox 테이블 폴링 → Kafka 발행
     │
     ▼
[Kafka: payment.requested 토픽]
     │
     ▼
[PaymentConsumer]
     │  1. Redis 분산락 획득 (동일 주문 동시 처리 방지)
     │  2. 잔액 확인 & 차감 (낙관적 락)
     │  3. Payment status → APPROVED / FAILED
     │  4. Transaction 레코드 생성
     │  5. 분산락 해제
     │
     ├── 성공 → Kafka: payment.approved
     └── 실패 → Kafka: payment.failed
              └── 재시도 3회 후 → DLQ (Dead Letter Queue)
```

### 중복결제 방지 (Redis)
```typescript
// 멱등성 키 기반
const exists = await redis.set(
  `idempotency:${idempotencyKey}`,
  paymentId,
  'EX', 86400,  // 24시간
  'NX'          // 키가 없을 때만 설정
);
if (!exists) {
  // 이미 처리된 요청 → 기존 결과 반환
}
```

### 분산락 (Redis + Redlock)
```typescript
// 동일 주문에 대한 동시 처리 방지
const lock = await redisService.acquireLock(
  `payment-lock:${orderId}`,
  5000  // 5초 TTL
);
try {
  // 결제 처리 로직
} finally {
  await lock.release();
}
```

### 낙관적 락 (TypeORM @VersionColumn)
```typescript
@Entity()
class Payment {
  @VersionColumn()
  version: number;  // UPDATE 시 자동 버전 체크
}
```

---

## 5. 장애 처리 전략

| 장애 상황 | 처리 방법 |
|-----------|----------|
| 중복 결제 요청 | Redis 멱등성 키로 차단 |
| 동시 결제 요청 | Redis 분산락 + 낙관적 락 |
| Kafka 발행 실패 | Transactional Outbox 패턴으로 보장 |
| Consumer 처리 실패 | 자동 재시도 (3회) → DLQ |
| DB 트랜잭션 실패 | TypeORM 트랜잭션 롤백 |
| 외부 API 타임아웃 | Circuit Breaker 패턴 |
| 부분 실패 (정산 중) | 보상 트랜잭션 (Saga 패턴 간소화) |

### DLQ 재처리 플로우
```
[DLQ 토픽] → [DLQ Consumer] → 알림 발송 + 수동/자동 재처리
```

---

## 6. Docker Compose 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| app | 3000 | NestJS 앱 |
| mysql | 3306 | MySQL 8.0 |
| redis | 6379 | Redis 7 |
| zookeeper | 2181 | Kafka 의존성 |
| kafka | 9092 | Kafka |
| kafka-ui | 8080 | Kafka 모니터링 UI |

---

## 7. 구현 순서 (Phase)

### Phase 1: 기반 구축
- [ ] NestJS 프로젝트 초기화 + 기본 설정
- [ ] Docker Compose (MySQL, Redis, Kafka)
- [ ] TypeORM 설정 + Entity 생성
- [ ] 공통 모듈 (예외 필터, 인터셉터, Swagger)

### Phase 2: 인증 & 사용자
- [ ] User 모듈 (CRUD)
- [ ] Auth 모듈 (JWT 로그인/회원가입)
- [ ] Account 모듈 (계좌 등록/관리)

### Phase 3: 결제 핵심
- [ ] Payment 모듈 (결제 요청/승인/취소)
- [ ] Redis 멱등성 키 처리
- [ ] Redis 분산락
- [ ] 낙관적 락 적용
- [ ] DB 트랜잭션 처리

### Phase 4: 비동기 처리
- [ ] Kafka Producer/Consumer 설정
- [ ] Transactional Outbox 패턴
- [ ] 비동기 결제 승인 플로우
- [ ] DLQ + 재시도 로직

### Phase 5: 거래내역 & 정산
- [ ] Transaction 모듈 (거래내역 조회)
- [ ] Settlement 모듈 (정산 배치)
- [ ] 정산 스케줄러 (Cron)

### Phase 6: 품질 & 문서화
- [ ] 단위 테스트 (핵심 서비스)
- [ ] E2E 테스트 (결제 플로우)
- [ ] Swagger 문서 완성
- [ ] README.md 작성

---

## 8. 검증 방법

1. **Docker Compose로 전체 인프라 실행**: `docker-compose up -d`
2. **Swagger UI에서 API 테스트**: `http://localhost:3000/api-docs`
3. **결제 플로우 E2E**:
   - 회원가입 → 로그인 → 계좌 등록 → 결제 요청 → 승인 → 거래내역 확인
4. **중복결제 테스트**: 동일 멱등성 키로 2회 요청 → 1건만 처리
5. **동시성 테스트**: 동일 주문 동시 요청 → 1건만 성공
6. **장애 복구 테스트**: Kafka Consumer 중단 후 재시작 → 메시지 재처리
