import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettlementService } from './settlement.service';

@Injectable()
export class SettlementScheduler {
  private readonly logger = new Logger(SettlementScheduler.name);

  constructor(private readonly settlementService: SettlementService) {}

  /** 매일 새벽 2시에 전일 정산 실행 */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailySettlement() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0];

    this.logger.log(`Starting daily settlement for ${targetDate}`);
    await this.settlementService.processDaily(targetDate);
  }
}
