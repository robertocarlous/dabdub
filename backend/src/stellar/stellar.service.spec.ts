jest.mock('stellar-sdk', () => {
  class MockNotFoundError extends Error {
    constructor(
      message: string,
      public readonly response?: unknown,
    ) {
      super(message);
    }
  }

  class MockBadResponseError extends Error {
    constructor(
      message: string,
      public readonly response?: unknown,
    ) {
      super(message);
    }
  }

  class MockServer {
    loadAccount = jest.fn();
    friendbot = jest.fn().mockReturnValue({ call: jest.fn() });
    feeStats = jest.fn();
    submitTransaction = jest.fn();
    transactions = jest.fn().mockReturnValue({
      transaction: jest.fn().mockReturnValue({ call: jest.fn() }),
    });
  }

  const serverInstance = new MockServer();

  class MockTransaction {
    public readonly operations: unknown[];
    public readonly memo: { type: string };
    public readonly fee: string;
    public readonly source: string;
    public readonly networkPassphrase: string;
    public readonly timeBounds?: { minTime: string; maxTime: string };

    constructor(
      public readonly xdr: string,
      options: {
        operations?: unknown[];
        memo?: { type: string };
        fee?: string;
        source?: string;
        networkPassphrase?: string;
        timeBounds?: { minTime: string; maxTime: string };
      } = {},
    ) {
      this.operations = options.operations ?? [];
      this.memo = options.memo ?? { type: 'none' };
      this.fee = options.fee ?? '100';
      this.source = options.source ?? 'GTESTSOURCE';
      this.networkPassphrase =
        options.networkPassphrase ?? 'Test SDF Network ; September 2015';
      this.timeBounds = options.timeBounds;
    }

    sign = jest.fn();
    toXDR = jest.fn(() => this.xdr);
  }

  class MockTransactionBuilder {
    static fromXDR = jest.fn();
    addOperation = jest.fn().mockReturnThis();
    addMemo = jest.fn().mockReturnThis();
    setTimeout = jest.fn().mockReturnThis();

    constructor(
      public readonly sourceAccount: unknown,
      public readonly options: unknown,
    ) {}

    build() {
      return new MockTransaction('rebuilt-xdr');
    }
  }

  return {
    Horizon: {
      Server: jest.fn(() => serverInstance),
    },
    NotFoundError: MockNotFoundError,
    BadResponseError: MockBadResponseError,
    Transaction: MockTransaction,
    FeeBumpTransaction: class MockFeeBumpTransaction {},
    TransactionBuilder: MockTransactionBuilder,
    Keypair: {
      fromSecret: jest.fn((secret: string) => ({ secret })),
    },
    xdr: {
      TransactionResult: {
        fromXDR: jest.fn(),
      },
    },
    __mockServer: serverInstance,
    __MockTransaction: MockTransaction,
    __MockTransactionBuilder: MockTransactionBuilder,
  };
});

import * as StellarSdk from 'stellar-sdk';
import {
  AccountNotFoundException,
  StellarSubmitException,
} from './stellar.exceptions';
import { StellarService } from './stellar.service';

const sdkMock = StellarSdk as typeof StellarSdk & {
  __mockServer: {
    loadAccount: jest.Mock;
    friendbot: jest.Mock;
    feeStats: jest.Mock;
    submitTransaction: jest.Mock;
    transactions: jest.Mock;
  };
  __MockTransaction: new (
    xdr: string,
    options?: Record<string, unknown>,
  ) => StellarSdk.Transaction;
  __MockTransactionBuilder: {
    fromXDR: jest.Mock;
  };
};

describe('StellarService', () => {
  const config = {
    network: 'testnet' as const,
    rpcUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'contract-id',
    adminSecretKey: 'stellar-admin-secret-key-that-is-32chars!!',
  };

  let service: StellarService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StellarService(config);
  });

  it('maps 404 account errors to AccountNotFoundException', async () => {
    sdkMock.__mockServer.loadAccount.mockRejectedValue(
      new StellarSdk.NotFoundError('not found', { status: 404 }),
    );

    await expect(service.loadAccount('GACCOUNT')).rejects.toBeInstanceOf(
      AccountNotFoundException,
    );
  });

  it('retries 503 errors three times before succeeding', async () => {
    const waitForRetry = jest.fn().mockResolvedValue(undefined);
    (service as unknown as { waitForRetry: typeof waitForRetry }).waitForRetry =
      waitForRetry;
    sdkMock.__mockServer.loadAccount
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValue({ accountId: 'GACCOUNT' });

    await expect(service.loadAccount('GACCOUNT')).resolves.toEqual({
      accountId: 'GACCOUNT',
    });
    expect(sdkMock.__mockServer.loadAccount).toHaveBeenCalledTimes(4);
    expect(waitForRetry).toHaveBeenCalledTimes(3);
  });

  it('parses submission failures into StellarSubmitException', async () => {
    const transaction = new sdkMock.__MockTransaction('signed-xdr');
    sdkMock.__MockTransactionBuilder.fromXDR.mockReturnValue(transaction);
    sdkMock.__mockServer.submitTransaction.mockRejectedValue(
      new StellarSdk.BadResponseError('submit failed', {
        extras: {
          result_xdr: 'AAAA',
          result_codes: {
            transaction: 'tx_failed',
            operations: ['op_underfunded'],
          },
        },
      }),
    );
    (StellarSdk.xdr.TransactionResult.fromXDR as jest.Mock).mockReturnValue({
      result: () => ({
        switch: () => ({ name: 'txFailed' }),
      }),
    });

    await expect(service.submitTransaction('signed-xdr')).rejects.toBeInstanceOf(
      StellarSubmitException,
    );

    try {
      await service.submitTransaction('signed-xdr');
    } catch (error) {
      const submitError = error as StellarSubmitException;
      expect(submitError.details).toEqual(
        expect.objectContaining({
          transactionCode: 'txFailed',
          operationCodes: ['op_underfunded'],
        }),
      );
    }
  });

  it('reloads and retries once on tx_bad_seq', async () => {
    const original = new sdkMock.__MockTransaction('signed-xdr', {
      operations: [{ type: 'payment' }],
      source: 'GSOURCE',
      fee: '100',
    });
    const refreshedAccount = { accountId: 'GSOURCE', sequence: '22' };

    sdkMock.__MockTransactionBuilder.fromXDR.mockReturnValue(original);
    sdkMock.__mockServer.submitTransaction
      .mockRejectedValueOnce(
        new StellarSdk.BadResponseError('bad seq', {
          extras: {
            result_xdr: 'AAAA',
            result_codes: {
              transaction: 'tx_bad_seq',
              operations: [],
            },
          },
        }),
      )
      .mockResolvedValueOnce({ hash: 'abc', successful: true });
    sdkMock.__mockServer.loadAccount.mockResolvedValue(refreshedAccount);

    const signed = service.signTransaction(original, 'SBADSEQSECRET');
    await expect(service.submitTransaction(signed)).resolves.toEqual({
      hash: 'abc',
      successful: true,
    });
    expect(sdkMock.__mockServer.loadAccount).toHaveBeenCalledWith('GSOURCE');
    expect(sdkMock.__mockServer.submitTransaction).toHaveBeenCalledTimes(2);
  });
});
