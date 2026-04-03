import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Transaction')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @ApiOperation({ summary: '거래내역 목록 (페이징, 필터)' })
  async findAll(
    @CurrentUser('id') userId: number,
    @Query() query: QueryTransactionDto,
  ) {
    return this.transactionService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '거래내역 상세' })
  async findOne(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.transactionService.findById(id, userId);
  }
}
