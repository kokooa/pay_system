import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettlementService } from './settlement.service';

@Injectable()
export class SettlementScheduler {
  private readonly logger = new Logger(SettlementScheduler.name);

  constructor(private readonly settlementService: SettlementService) {}

  /** 매일 새벽 2시(KST)에 전일 정산 실행 */
  @Cron('0 2 * * *', { timeZone: 'Asia/Seoul' })
  async handleDailySettlement() {
    // KST 기준 어제 날짜 계산
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    kstNow.setDate(kstNow.getDate() - 1);
    const targetDate = kstNow.toISOString().split('T')[0];

    this.logger.log(`Starting daily settlement for ${targetDate}`);
    await this.settlementService.processDaily(targetDate);
  }
}
