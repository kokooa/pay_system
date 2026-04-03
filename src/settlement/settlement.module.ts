import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settlement } from './entities/settlement.entity';
import { Payment } from '../payment/entities/payment.entity';
import { SettlementService } from './settlement.service';
import { SettlementController } from './settlement.controller';
import { SettlementScheduler } from './settlement.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Settlement, Payment])],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementScheduler],
})
export class SettlementModule {}
