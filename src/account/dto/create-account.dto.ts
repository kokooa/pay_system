import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: '004', description: '은행코드 (예: 004 = KB국민)' })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: '123-456-789012', description: '계좌번호' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: '홍길동', description: '예금주' })
  @IsString()
  accountHolder: string;

  @ApiProperty({ example: true, description: '기본계좌 설정 여부', required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
