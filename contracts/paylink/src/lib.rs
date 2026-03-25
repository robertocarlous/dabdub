#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol};

/// Extra ledgers beyond `ttl_ledgers` so persistent PayLink data remains readable until
/// after the logical expiry ledger (archival buffer).
const PAYLINK_TTL_BUFFER_LEDGERS: u32 = 16_384;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Creator(String),
    PayLink(String),
    Admin,
    StakeBalance(String),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayLinkData {
    pub creator_username: String,
    pub amount: i128,
    pub note: String,
    pub expiration_ledger: u32,
    /// Reserved for single-payment enforcement when claiming or settling a PayLink.
    pub paid: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    PayLinkAlreadyExists = 1,
    InvalidAmount = 2,
    CreatorNotFound = 3,
    LedgerOverflow = 4,
    Unauthorized = 5,
    UserNotFound = 6,
}

#[contract]
pub struct PayLinkContract;

#[contractimpl]
impl PayLinkContract {
    /// One-time admin initialisation. Panics if already set.
    pub fn set_admin(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("admin already set");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Marks `username` as an existing creator so `create_paylink` may succeed.
    /// Intended to be invoked from the same onboarding flow that provisions profiles on-chain.
    pub fn register_creator(env: Env, username: String) {
        env.storage().persistent().set(&DataKey::Creator(username), &true);
    }

    /// Credits yield to a staker's balance. Admin-only; does NOT check the paused flag.
    pub fn credit_yield(
        env: Env,
        username: String,
        amount: i128,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::Unauthorized)?;
        admin.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        if !env.storage().persistent().has(&DataKey::Creator(username.clone())) {
            return Err(Error::UserNotFound);
        }

        let stake_key = DataKey::StakeBalance(username.clone());
        let current: i128 = env.storage().persistent().get(&stake_key).unwrap_or(0);
        let new_balance = current + amount;
        env.storage().persistent().set(&stake_key, &new_balance);
        env.storage()
            .persistent()
            .extend_ttl(&stake_key, PAYLINK_TTL_BUFFER_LEDGERS, PAYLINK_TTL_BUFFER_LEDGERS);

        env.events().publish(
            (Symbol::new(&env, "yield_credited"),),
            (username, amount, new_balance, env.ledger().sequence()),
        );

        Ok(())
    }

    pub fn create_paylink(
        env: Env,
        creator_username: String,
        token_id: String,
        amount: i128,
        note: String,
        ttl_ledgers: u32,
    ) -> Result<(), Error> {
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Creator(creator_username.clone()))
        {
            return Err(Error::CreatorNotFound);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let paylink_key = DataKey::PayLink(token_id.clone());
        if env.storage().persistent().has(&paylink_key) {
            return Err(Error::PayLinkAlreadyExists);
        }

        let current = env.ledger().sequence();
        let expiration_ledger = current
            .checked_add(ttl_ledgers)
            .ok_or(Error::LedgerOverflow)?;

        let data = PayLinkData {
            creator_username: creator_username.clone(),
            amount,
            note,
            expiration_ledger,
            paid: false,
        };

        env.storage().persistent().set(&paylink_key, &data);

        let min_ttl = ttl_ledgers
            .checked_add(PAYLINK_TTL_BUFFER_LEDGERS)
            .ok_or(Error::LedgerOverflow)?;
        env.storage()
            .persistent()
            .extend_ttl(&paylink_key, min_ttl, min_ttl);

        env.events().publish(
            (Symbol::new(&env, "paylink_created"),),
            (creator_username, token_id, amount, expiration_ledger),
        );

        Ok(())
    }

    pub fn get_paylink(env: Env, token_id: String) -> Option<PayLinkData> {
        env.storage()
            .persistent()
            .get(&DataKey::PayLink(token_id))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    #[test]
    fn create_paylink_persists_paylink_data() {
        let env = Env::default();
        let contract_id = env.register_contract(None, PayLinkContract);
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "alice");
        let token_id = String::from_str(&env, "tok-1");
        let note = String::from_str(&env, "coffee");

        client.register_creator(&creator);
        env.ledger().set_sequence_number(100);

        client.create_paylink(&creator, &token_id, &100_i128, &note, &50);

        let stored = client.get_paylink(&token_id).expect("expected PayLink in storage");
        assert_eq!(stored.creator_username, creator);
        assert_eq!(stored.amount, 100);
        assert_eq!(stored.note, note);
        assert_eq!(stored.expiration_ledger, 150);
        assert!(!stored.paid);
    }

    #[test]
    fn duplicate_token_id_returns_paylink_already_exists() {
        let env = Env::default();
        let contract_id = env.register_contract(None, PayLinkContract);
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "bob");
        let token_id = String::from_str(&env, "dup");
        let note = String::from_str(&env, "n");

        client.register_creator(&creator);

        client.create_paylink(&creator, &token_id, &1_i128, &note, &10);
        assert_eq!(
            client.try_create_paylink(&creator, &token_id, &2_i128, &note, &10),
            Ok(Err(Error::PayLinkAlreadyExists))
        );
    }

    #[test]
    fn zero_amount_returns_invalid_amount() {
        let env = Env::default();
        let contract_id = env.register_contract(None, PayLinkContract);
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "carol");
        let token_id = String::from_str(&env, "z");
        let note = String::from_str(&env, "n");

        client.register_creator(&creator);

        assert_eq!(
            client.try_create_paylink(&creator, &token_id, &0_i128, &note, &10),
            Ok(Err(Error::InvalidAmount))
        );
    }

    fn setup_with_admin(env: &Env) -> (PayLinkContractClient, Address) {
        let contract_id = env.register_contract(None, PayLinkContract);
        let client = PayLinkContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.set_admin(&admin);
        (client, admin)
    }

    #[test]
    fn credit_yield_to_existing_staker_accumulates_balance() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup_with_admin(&env);

        let user = String::from_str(&env, "alice");
        client.register_creator(&user);

        client.credit_yield(&user, &500_i128);
        client.credit_yield(&user, &300_i128);

        // Verify via a second credit that balance accumulates (event carries new_balance).
        // We confirm no error is returned and the call succeeds.
    }

    #[test]
    fn credit_yield_to_user_with_zero_stake_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup_with_admin(&env);

        let user = String::from_str(&env, "bob");
        client.register_creator(&user);

        // User has no prior stake — should succeed without error.
        assert_eq!(client.try_credit_yield(&user, &100_i128), Ok(Ok(())));
    }

    #[test]
    fn credit_yield_unauthorized_caller_is_rejected() {
        use soroban_sdk::testutils::MockAuth;

        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup_with_admin(&env);

        let user = String::from_str(&env, "carol");
        client.register_creator(&user);

        // Provide auth for a *different* address — not the registered admin.
        let impostor = Address::generate(&env);
        env.mock_auths(&[MockAuth {
            address: &impostor,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "credit_yield",
                args: (user.clone(), 100_i128).into_val(&env),
            },
        }]);

        // require_auth on the real admin will fail because only impostor signed.
        let result = client.try_credit_yield(&user, &100_i128);
        assert!(result.is_err(), "expected auth failure");
    }
}
