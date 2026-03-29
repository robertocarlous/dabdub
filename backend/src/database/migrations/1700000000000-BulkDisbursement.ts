import { MigrationInterface, QueryRunner } from "typeorm";

export class BulkDisbursement1700000000000 implements MigrationInterface {
    name = 'BulkDisbursement1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "bulk_disbursement_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed');
        `);
        await queryRunner.query(`
            CREATE TABLE "bulk_disbursements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "user_id" uuid NOT NULL,
                "file_name" character varying(255) NOT NULL,
                "reference" character varying(100) NOT NULL,
                "total_items" integer NOT NULL DEFAULT 0,
                "processed_items" integer NOT NULL DEFAULT 0,
                "failed_items" integer NOT NULL DEFAULT 0,
                "total_amount_usdc" numeric(24,8) NOT NULL DEFAULT 0,
                "status" "bulk_disbursement_status_enum" NOT NULL DEFAULT 'pending',
                "failure_reason" text,
                CONSTRAINT "UQ_bulk_disbursements_reference" UNIQUE ("reference"),
                CONSTRAINT "PK_bulk_disbursements_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bulk_disbursements_user_id" ON "bulk_disbursements" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bulk_disbursements_user_id_created_at" ON "bulk_disbursements" ("user_id", "created_at")
        `);

        // Modify off_ramps table
        await queryRunner.query(`
            ALTER TABLE "off_ramps" ALTER COLUMN "bank_account_id" DROP NOT NULL;
        `);
        await queryRunner.query(`
            ALTER TABLE "off_ramps" ADD "bulk_disbursement_id" uuid;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "off_ramps" DROP COLUMN "bulk_disbursement_id";
        `);
        await queryRunner.query(`
            ALTER TABLE "off_ramps" ALTER COLUMN "bank_account_id" SET NOT NULL;
        `);
        
        await queryRunner.query(`DROP INDEX "IDX_bulk_disbursements_user_id_created_at"`);
        await queryRunner.query(`DROP INDEX "IDX_bulk_disbursements_user_id"`);
        await queryRunner.query(`DROP TABLE "bulk_disbursements"`);
        await queryRunner.query(`DROP TYPE "bulk_disbursement_status_enum"`);
    }
}
