import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer;
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(private readonly configService: ConfigService) {
    const kafka = new Kafka({
      clientId: 'pay-system',
      brokers: this.configService.get<string>('KAFKA_BROKERS')!.split(','),
    });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka Producer connected');
    } catch (error) {
      this.logger.error('Kafka Producer connection failed', error);
    }
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async send(
    topic: string,
    message: {
      key?: string;
      value: any;
      headers?: Record<string, string>;
    },
  ) {
    await this.producer.send({
      topic,
      messages: [
        {
          key: message.key,
          value: JSON.stringify(message.value),
          headers: message.headers,
        },
      ],
    });
    this.logger.debug(`Message sent to topic: ${topic}`);
  }
}
