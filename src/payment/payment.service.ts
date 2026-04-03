import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentOutbox } from './entities/payment-outbox.entity';
import { Transaction, TransactionType } from '../transaction/entities/transaction.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AccountService } from '../account/account.service';
import { RedisService } from '../redis/redis.service';
import { KafkaProducerService } from '../kafka/kafka.producer';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(PaymentOutbox)
    private readonly outboxRepository: Repository<PaymentOutbox>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly accountService: AccountService,
    private readonly redisService: RedisService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /** 결제 요청 */
  async createPayment(
    userId: number,
    dto: CreatePaymentDto,
    idempotencyKey: string,
  ): Promise<Payment> {
    // 1. 멱등성 키 확인 (중복 결제 방지)
    const isNew = await this.redisService.setIdempotencyKey(
      idempotencyKey,
      'processing',
    );

    if (!isNew) {
      // 이미 처리된 요청 → 기존 결제 반환
      const existingPaymentId =
        await this.redisService.getIdempotencyKey(idempotencyKey);
      const existing = await this.paymentRepository.findOne({
        where: { idempotencyKey },
      });
      if (existing) return existing;
      throw new ConflictException('이미 처리 중인 요청입니다.');
    }

    // 2. 계좌 유효성 확인
    await this.accountService.findByIdAndUser(dto.accountId, userId);

    // 3. 트랜잭션으로 Payment + Outbox 동시 저장 (Transactional Outbox 패턴)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const paymentKey = `pay_${uuidv4().replace(/-/g, '')}`;

      const payment = queryRunner.manager.create(Payment, {
        paymentKey,
        idempotencyKey,
        userId,
        accountId: dto.accountId,
        orderId: dto.orderId,
        amount: dto.amount,
        status: PaymentStatus.PENDING,
      });
      const savedPayment = await queryRunner.manager.save(payment);

      // Outbox에 이벤트 저장 (Kafka 발행 보장)
      const outbox = queryRunner.manager.create(PaymentOutbox, {
        aggregateType: 'Payment',
        aggregateId: savedPayment.id,
        eventType: 'payment.requested',
        payload: {
          paymentId: savedPayment.id,
          paymentKey: savedPayment.paymentKey,
          userId,
          accountId: dto.accountId,
          orderId: dto.orderId,
          amount: dto.amount,
        },
      });
      await queryRunner.manager.save(outbox);

      await queryRunner.commitTransaction();

      // 멱등성 키에 결제 ID 저장
      await this.redisService.set(
        `idempotency:${idempotencyKey}`,
        String(savedPayment.id),
        86400,
      );

      // Kafka로 결제 요청 이벤트 발행 (Outbox relay 대신 즉시 발행)
      await this.publishOutboxEvent(outbox);

      this.logger.log(
        `Payment created: ${savedPayment.paymentKey} (${dto.amount}원)`,
      );
      return savedPayment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await this.redisService.del(`idempotency:${idempotencyKey}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /** 결제 승인 (Kafka Consumer에서 호출) */
  async approvePayment(paymentId: number): Promise<Payment> {
    // 분산락 획득
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException('결제를 찾을 수 없습니다.');
    }

    const lock = await this.redisService.acquireLock(
      `payment:${payment.orderId}`,
      5000,
    );

    if (!lock.acquired) {
      throw new ConflictException('결제가 이미 처리 중입니다.');
    }

    try {
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(
          `결제 상태가 올바르지 않습니다: ${payment.status}`,
        );
      }

      // 트랜잭션으로 결제 승인 + 거래내역 생성
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // 낙관적 락으로 업데이트
        payment.status = PaymentStatus.APPROVED;
        payment.approvedAt = new Date();
        await queryRunner.manager.save(payment);

        // 거래내역 생성
        const transaction = queryRunner.manager.create(Transaction, {
          paymentId: payment.id,
          userId: payment.userId,
          type: TransactionType.PAYMENT,
          amount: payment.amount,
          balanceAfter: 0, // 실제로는 잔액 계산 필요
          description: `결제 승인 (주문: ${payment.orderId})`,
        });
        await queryRunner.manager.save(transaction);

        await queryRunner.commitTransaction();

        this.logger.log(`Payment approved: ${payment.paymentKey}`);
        return payment;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        // 낙관적 락 충돌 처리
        if (
          error instanceof Error &&
          error.message.includes('optimistic lock')
        ) {
          throw new ConflictException('동시 처리로 인한 충돌이 발생했습니다.');
        }
        throw error;
      } finally {
        await queryRunner.release();
      }
    } finally {
      await lock.release();
    }
  }

  /** 결제 취소 */
  async cancelPayment(paymentKey: string, userId: number): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { paymentKey, userId },
    });
    if (!payment) {
      throw new NotFoundException('결제를 찾을 수 없습니다.');
    }

    if (
      payment.status !== PaymentStatus.APPROVED &&
      payment.status !== PaymentStatus.PENDING
    ) {
      throw new BadRequestException('취소할 수 없는 결제 상태입니다.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      payment.status = PaymentStatus.CANCELLED;
      await queryRunner.manager.save(payment);

      const transaction = queryRunner.manager.create(Transaction, {
        paymentId: payment.id,
        userId: payment.userId,
        type: TransactionType.CANCEL,
        amount: payment.amount,
        balanceAfter: 0,
        description: `결제 취소 (주문: ${payment.orderId})`,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      // 취소 이벤트 발행
      await this.kafkaProducer.send('payment.cancelled', {
        key: payment.paymentKey,
        value: { paymentId: payment.id, paymentKey: payment.paymentKey },
      });

      this.logger.log(`Payment cancelled: ${payment.paymentKey}`);
      return payment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /** 결제 조회 */
  async findByPaymentKey(paymentKey: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { paymentKey },
      relations: ['account'],
    });
    if (!payment) {
      throw new NotFoundException('결제를 찾을 수 없습니다.');
    }
    return payment;
  }

  /** Outbox 이벤트 발행 + 발행 완료 마킹 */
  private async publishOutboxEvent(outbox: PaymentOutbox): Promise<void> {
    try {
      await this.kafkaProducer.send(outbox.eventType, {
        key: String(outbox.aggregateId),
        value: outbox.payload,
      });

      outbox.isPublished = true;
      await this.outboxRepository.save(outbox);
    } catch (error) {
      this.logger.warn(
        `Outbox event publish failed (id: ${outbox.id}), will be retried`,
      );
    }
  }
}
