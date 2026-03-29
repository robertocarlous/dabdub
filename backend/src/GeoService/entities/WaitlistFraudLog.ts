import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class WaitlistFraudLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  ipAddress: string;

  @Column()
  country: string;

  @CreateDateColumn()
  createdAt: Date;
}
