import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: '이메일' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password1!', description: '비밀번호 (8자 이상)' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: '홍길동', description: '이름' })
  @IsString()
  name: string;

  @ApiProperty({ example: '010-1234-5678', description: '전화번호' })
  @IsString()
  @Matches(/^01[016789]-?\d{3,4}-?\d{4}$/, {
    message: '올바른 전화번호 형식이 아닙니다.',
  })
  phone: string;
}
