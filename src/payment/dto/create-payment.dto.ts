import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsPositive, Max, IsInt } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 1, description: '출금 계좌 ID' })
  @IsNumber()
  accountId: number;

  @ApiProperty({ example: 'ORDER-20240101-001', description: '주문 ID' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 50000, description: '결제 금액 (최대 1,000만원)' })
  @IsInt()
  @IsPositive()
  @Max(10_000_000)
  amount: number;
}
