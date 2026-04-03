import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentOutbox } from './entities/payment-outbox.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentConsumer } from './payment.consumer';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentOutbox, Transaction]),
    AccountModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentConsumer],
  exports: [PaymentService],
})
export class PaymentModule {}
