import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountStatus } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async create(userId: number, dto: CreateAccountDto): Promise<Account> {
    // 기본계좌로 설정할 경우 기존 기본계좌 해제
    if (dto.isDefault) {
      await this.accountRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const account = this.accountRepository.create({
      ...dto,
      userId,
      isVerified: true, // 실제로는 계좌 인증 프로세스 필요
    });

    return this.accountRepository.save(account);
  }

  async findAllByUser(userId: number): Promise<Account[]> {
    return this.accountRepository.find({
      where: { userId, status: AccountStatus.ACTIVE },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findByIdAndUser(id: number, userId: number): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { id, userId, status: AccountStatus.ACTIVE },
    });
    if (!account) {
      throw new NotFoundException('계좌를 찾을 수 없습니다.');
    }
    return account;
  }

  async setDefault(id: number, userId: number): Promise<Account> {
    const account = await this.findByIdAndUser(id, userId);

    // 기존 기본계좌 해제
    await this.accountRepository.update(
      { userId, isDefault: true },
      { isDefault: false },
    );

    account.isDefault = true;
    return this.accountRepository.save(account);
  }

  async remove(id: number, userId: number): Promise<void> {
    const account = await this.findByIdAndUser(id, userId);
    account.status = AccountStatus.INACTIVE;
    await this.accountRepository.save(account);
  }
}
