import { Inject, Injectable, Logger } from '@nestjs/common';
import * as StellarSdk from 'stellar-sdk';
import { stellarConfig } from '../config/stellar.config';
import type { StellarConfig } from '../config/stellar.config';
import {
  AccountNotFoundException,
  StellarSubmitException,
} from './stellar.exceptions';
import { getErrorStatus, retryStellarRequest, sleep } from './stellar.retry';
import {
  type BuildTransactionOptions,
  type StellarSubmitErrorDetails,
  StellarTransactionStatus,
} from './stellar.types';

const DEFAULT_TIMEOUT_SECONDS = 30;

interface HorizonSubmitErrorResponse {
  extras?: {
    result_xdr?: string;
    result_codes?: {
      transaction?: string;
      operations?: string[];
    };
  };
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: StellarSdk.Horizon.Server;
  private readonly signerCache = new Map<string, string>();
  private readonly waitForRetry = sleep;

  constructor(
    @Inject(stellarConfig.KEY)
    private readonly config: StellarConfig,
  ) {
    this.server = new StellarSdk.Horizon.Server(config.rpcUrl);
  }

  async loadAccount(
    publicKey: string,
  ): Promise<StellarSdk.Horizon.AccountResponse> {
    try {
      return await retryStellarRequest(
        () => this.server.loadAccount(publicKey),
        this.waitForRetry,
      );
    } catch (error) {
      if (
        error instanceof StellarSdk.NotFoundError ||
        getErrorStatus(error) === 404
      ) {
        throw new AccountNotFoundException(publicKey);
      }

      throw error;
    }
  }

  async fundWithFriendbot(publicKey: string): Promise<unknown> {
    if (this.config.network !== 'testnet') {
      throw new Error('Friendbot funding is only available on testnet');
    }

    return retryStellarRequest(
      () => this.server.friendbot(publicKey).call(),
      this.waitForRetry,
    );
  }

  async buildTransaction({
    sourceAccount,
    operations,
    memo,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  }: BuildTransactionOptions): Promise<StellarSdk.Transaction> {
    const account =
      typeof sourceAccount === 'string'
        ? await this.loadAccount(sourceAccount)
        : sourceAccount;
    const feeStats = await retryStellarRequest(
      () => this.server.feeStats(),
      this.waitForRetry,
    );

    const builder = new StellarSdk.TransactionBuilder(account, {
      fee: feeStats.fee_charged.p90,
      networkPassphrase: this.config.networkPassphrase,
    });

    for (const operation of operations) {
      builder.addOperation(operation);
    }

    if (memo) {
      builder.addMemo(memo);
    }

    builder.setTimeout(timeoutSeconds);
    return builder.build();
  }

  signTransaction(
    transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction,
    secretKey: string,
  ): string {
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    transaction.sign(keypair);

    const signedXdr = transaction.toXDR();
    this.signerCache.set(signedXdr, secretKey);
    return signedXdr;
  }

  async submitTransaction(
    signedTx: string,
  ): Promise<StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse> {
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      signedTx,
      this.config.networkPassphrase,
    );

    try {
      return await retryStellarRequest(
        () => this.server.submitTransaction(transaction),
        this.waitForRetry,
      );
    } catch (error) {
      if (
        transaction instanceof StellarSdk.Transaction &&
        this.isBadSequenceError(error)
      ) {
        const cachedSecret = this.signerCache.get(signedTx);
        if (cachedSecret) {
          const refreshed = await this.rebuildSignedTransaction(
            transaction,
            cachedSecret,
          );
          const refreshedXdr = refreshed.toXDR();

          try {
            return retryStellarRequest(
              () => this.server.submitTransaction(refreshed),
              this.waitForRetry,
            );
          } finally {
            this.signerCache.delete(refreshedXdr);
          }
        }
      }

      throw this.toSubmitException(error);
    } finally {
      this.signerCache.delete(signedTx);
    }
  }

  async getTransactionStatus(
    txHash: string,
  ): Promise<StellarTransactionStatus> {
    try {
      const record = await retryStellarRequest(
        () => this.server.transactions().transaction(txHash).call(),
        this.waitForRetry,
      );

      return record.successful
        ? StellarTransactionStatus.SUCCESS
        : StellarTransactionStatus.FAILED;
    } catch (error) {
      if (
        error instanceof StellarSdk.NotFoundError ||
        getErrorStatus(error) === 404
      ) {
        return StellarTransactionStatus.NOT_FOUND;
      }

      throw error;
    }
  }

  private isBadSequenceError(error: unknown): boolean {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'extras' in error.response &&
      error.response.extras &&
      typeof error.response.extras === 'object' &&
      'result_codes' in error.response.extras &&
      error.response.extras.result_codes &&
      typeof error.response.extras.result_codes === 'object' &&
      'transaction' in error.response.extras.result_codes
    ) {
      return error.response.extras.result_codes.transaction === 'tx_bad_seq';
    }

    return false;
  }

  private async rebuildSignedTransaction(
    transaction: StellarSdk.Transaction,
    secretKey: string,
  ): Promise<StellarSdk.Transaction> {
    const reloadedAccount = await this.loadAccount(transaction.source);
    const builder = new StellarSdk.TransactionBuilder(reloadedAccount, {
      fee: transaction.fee,
      networkPassphrase: this.config.networkPassphrase,
      timebounds: transaction.timeBounds
        ? {
            minTime: transaction.timeBounds.minTime,
            maxTime: transaction.timeBounds.maxTime,
          }
        : undefined,
      ledgerbounds: transaction.ledgerBounds
        ? {
            minLedger: transaction.ledgerBounds.minLedger,
            maxLedger: transaction.ledgerBounds.maxLedger,
          }
        : undefined,
      minAccountSequence: transaction.minAccountSequence,
      minAccountSequenceAge: transaction.minAccountSequenceAge,
      minAccountSequenceLedgerGap: transaction.minAccountSequenceLedgerGap,
      extraSigners: transaction.extraSigners,
    });

    for (const operation of transaction.operations) {
      builder.addOperation(operation as unknown as StellarSdk.xdr.Operation);
    }

    if (transaction.memo && transaction.memo.type !== 'none') {
      builder.addMemo(transaction.memo);
    }

    return StellarSdk.TransactionBuilder.fromXDR(
      this.signTransaction(builder.build(), secretKey),
      this.config.networkPassphrase,
    ) as StellarSdk.Transaction;
  }

  private toSubmitException(error: unknown): StellarSubmitException {
    const details = this.parseSubmitError(error);
    this.logger.error(`Stellar submit failed: ${JSON.stringify(details)}`);
    return new StellarSubmitException(details);
  }

  private parseSubmitError(error: unknown): StellarSubmitErrorDetails {
    const defaultDetails: StellarSubmitErrorDetails = {
      transactionCode: 'unknown',
      operationCodes: [],
    };

    if (!(error instanceof StellarSdk.BadResponseError)) {
      return defaultDetails;
    }

    const response = error.response as HorizonSubmitErrorResponse | undefined;
    const resultXdr = response?.extras?.result_xdr;
    if (!resultXdr) {
      return defaultDetails;
    }

    const parsed = StellarSdk.xdr.TransactionResult.fromXDR(
      resultXdr,
      'base64',
    );
    const operationCodes = response.extras?.result_codes?.operations ?? [];

    return {
      transactionCode: this.extractSwitchName(parsed.result()) ?? 'unknown',
      operationCodes,
      resultXdr,
    };
  }

  private extractSwitchName(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const switchable = value as { switch?: () => unknown };
    if (typeof switchable.switch !== 'function') {
      return undefined;
    }

    const switchValue = switchable.switch();
    if (!switchValue || typeof switchValue !== 'object') {
      return undefined;
    }

    const namedSwitchValue = switchValue as { name?: unknown };
    if (typeof namedSwitchValue.name === 'string') {
      return namedSwitchValue.name;
    }

    return undefined;
  }
}
