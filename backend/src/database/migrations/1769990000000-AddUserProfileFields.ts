import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserProfileFields1769990000000 implements MigrationInterface {
    name = 'AddUserProfileFields1769990000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`bio\` varchar(160) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`avatar_key\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`twitter_handle\` varchar(50) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`instagram_handle\` varchar(50) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`instagram_handle\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`twitter_handle\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`avatar_key\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`bio\``);
    }

}

