import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStakingEntries1700000000100 implements MigrationInterface {
  name = 'CreateStakingEntries1700000000100';
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("SET lock_timeout = '5s'");

    // Create enum for staking action
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "staking_entries_action_enum" AS ENUM ('stake', 'unstake', 'credit')
    `);

    // Create staking_entries table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staking_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "action" "staking_entries_action_enum" NOT NULL,
        "amount_usdc" varchar NOT NULL,
        "balance_before_usdc" varchar NOT NULL,
        "balance_after_usdc" varchar NOT NULL,
        "tx_hash" varchar,
        CONSTRAINT "PK_staking_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_staking_entries_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for efficient querying
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_staking_entries_user_created"
      ON "staking_entries" ("user_id", "createdAt" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_staking_entries_user_action"
      ON "staking_entries" ("user_id", "action")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staking_entries_user_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staking_entries_user_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staking_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "staking_entries_action_enum"`);
  }
}
