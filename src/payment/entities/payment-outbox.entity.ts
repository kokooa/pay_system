import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('payment_outbox')
export class PaymentOutbox {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 50 })
  aggregateType: string;

  @Column({ type: 'bigint' })
  aggregateId: number;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'json' })
  payload: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
