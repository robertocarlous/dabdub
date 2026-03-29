import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class SecurityAlert {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string; // e.g. suspicious_ip

  @Column()
  ipAddress: string;

  @Column()
  country: string;

  @CreateDateColumn()
  createdAt: Date;
}
