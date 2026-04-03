import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettlementService } from './settlement.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Settlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settlements')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get()
  @ApiOperation({ summary: '정산 내역 목록' })
  async findAll() {
    return this.settlementService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '정산 상세' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.settlementService.findById(id);
  }
}
