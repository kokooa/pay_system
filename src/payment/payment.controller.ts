import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiOperation({ summary: '결제 요청' })
  @ApiHeader({ name: 'idempotency-key', description: '멱등성 키 (중복 결제 방지)', required: true })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('idempotency-key 헤더가 필요합니다.');
    }
    return this.paymentService.createPayment(userId, dto, idempotencyKey);
  }

  @Post(':paymentKey/cancel')
  @ApiOperation({ summary: '결제 취소' })
  async cancel(
    @CurrentUser('id') userId: number,
    @Param('paymentKey') paymentKey: string,
  ) {
    return this.paymentService.cancelPayment(paymentKey, userId);
  }

  @Get(':paymentKey')
  @ApiOperation({ summary: '결제 상세 조회' })
  async findOne(@Param('paymentKey') paymentKey: string) {
    return this.paymentService.findByPaymentKey(paymentKey);
  }
}
