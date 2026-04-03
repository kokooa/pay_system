import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @ApiOperation({ summary: '계좌 등록' })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '내 계좌 목록' })
  async findAll(@CurrentUser('id') userId: number) {
    return this.accountService.findAllByUser(userId);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: '기본 계좌 설정' })
  async setDefault(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accountService.setDefault(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '계좌 삭제 (비활성화)' })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.accountService.remove(id, userId);
    return { message: '계좌가 삭제되었습니다.' };
  }
}
