import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { PaymentService } from './payment.service';
import { KafkaProducerService } from '../kafka/kafka.producer';

@Injectable()
export class PaymentConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;
  private readonly logger = new Logger(PaymentConsumer.name);
  private static readonly MAX_RETRIES = 3;

  constructor(
    private readonly configService: ConfigService,
    private readonly paymentService: PaymentService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {
    const kafka = new Kafka({
      clientId: 'pay-system-consumer',
      brokers: this.configService.get<string>('KAFKA_BROKERS')!.split(','),
    });
    this.consumer = kafka.consumer({ groupId: 'payment-group' });
  }

  async onModuleInit() {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['payment.requested'],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload) => this.handleMessage(payload),
      });

      this.logger.log('Payment Consumer started');
    } catch (error) {
      this.logger.error('Payment Consumer failed to start', error);
    }
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleMessage({ message, topic }: EachMessagePayload) {
    const value = JSON.parse(message.value!.toString());
    const retryCount = Number(message.headers?.['retry-count'] ?? 0);

    this.logger.debug(
      `Received message from ${topic}: paymentId=${value.paymentId}, retry=${retryCount}`,
    );

    try {
      await this.paymentService.approvePayment(value.paymentId);

      // 승인 성공 이벤트 발행
      await this.kafkaProducer.send('payment.approved', {
        key: value.paymentKey,
        value: { paymentId: value.paymentId, paymentKey: value.paymentKey },
      });
    } catch (error) {
      this.logger.error(
        `Payment processing failed: ${(error as Error).message}`,
      );

      if (retryCount < PaymentConsumer.MAX_RETRIES) {
        // 재시도
        await this.kafkaProducer.send('payment.requested', {
          key: message.key?.toString(),
          value: {
            ...value,
            headers: { 'retry-count': String(retryCount + 1) },
          },
        });
        this.logger.warn(
          `Retrying payment ${value.paymentId} (attempt ${retryCount + 1})`,
        );
      } else {
        // DLQ로 이동
        await this.kafkaProducer.send('payment.dlq', {
          key: message.key?.toString(),
          value: {
            ...value,
            error: (error as Error).message,
            failedAt: new Date().toISOString(),
          },
        });
        this.logger.error(
          `Payment ${value.paymentId} sent to DLQ after ${PaymentConsumer.MAX_RETRIES} retries`,
        );
      }
    }
  }
}
