import type * as StellarSdk from 'stellar-sdk';

export interface BuildTransactionOptions {
  sourceAccount: string | StellarSdk.Horizon.AccountResponse;
  operations: StellarSdk.xdr.Operation[];
  memo?: StellarSdk.Memo;
  timeoutSeconds?: number;
}

export interface StellarSubmitErrorDetails {
  transactionCode: string;
  operationCodes: string[];
  resultXdr?: string;
}

export enum StellarTransactionStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  NOT_FOUND = 'not_found',
}
