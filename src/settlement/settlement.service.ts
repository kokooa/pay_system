import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement, SettlementStatus } from './entities/settlement.entity';
import { Payment, PaymentStatus } from '../payment/entities/payment.entity';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);
  private static readonly FEE_RATE = 0.033; // 수수료율 3.3%

  constructor(
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  /** 일일 정산 처리 */
  async processDaily(targetDate: string): Promise<Settlement | null> {
    const startDate = new Date(`${targetDate}T00:00:00`);
    const endDate = new Date(`${targetDate}T23:59:59`);

    // 해당일 승인된 결제 합산
    const result = await this.paymentRepository
      .createQueryBuilder('p')
      .select('SUM(p.amount)', 'totalAmount')
      .where('p.status = :status', { status: PaymentStatus.APPROVED })
      .andWhere('p.approvedAt BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .getRawOne();

    const totalAmount = Number(result?.totalAmount ?? 0);
    if (totalAmount === 0) {
      this.logger.log(`No settlements for ${targetDate}`);
      return null;
    }

    const feeAmount = Math.round(totalAmount * SettlementService.FEE_RATE);
    const netAmount = totalAmount - feeAmount;

    const settlement = this.settlementRepository.create({
      merchantId: 'MERCHANT-001', // 데모용 가맹점
      settlementDate: targetDate,
      totalAmount,
      feeAmount,
      netAmount,
      status: SettlementStatus.COMPLETED,
    });

    const saved = await this.settlementRepository.save(settlement);
    this.logger.log(
      `Settlement completed for ${targetDate}: total=${totalAmount}, fee=${feeAmount}, net=${netAmount}`,
    );
    return saved;
  }

  async findAll() {
    return this.settlementRepository.find({
      order: { settlementDate: 'DESC' },
    });
  }

  async findById(id: number) {
    return this.settlementRepository.findOne({ where: { id } });
  }
}
