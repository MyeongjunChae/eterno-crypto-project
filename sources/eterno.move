module eterno::eterno;

use std::string;
use sui::coin::{Self, Coin};
use sui::coin_registry;
use sui::transfer;
use sui::tx_context::TxContext;

const DECIMALS: u8 = 9;
const BASE_UNITS: u64 = 1_000_000_000;
const TOTAL_SUPPLY: u64 = 999_999 * BASE_UNITS;

public struct ETERNO has drop {}

fun init(witness: ETERNO, ctx: &mut TxContext) {
    let (mut currency, mut treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        DECIMALS,
        string::utf8(b"E"),
        string::utf8(b"Eterno"),
        string::utf8(b"Fixed-supply Eterno currency on Sui."),
        string::utf8(b""),
        ctx,
    );

    let initial_supply: Coin<ETERNO> = coin::mint(&mut treasury_cap, TOTAL_SUPPLY, ctx);
    currency.make_supply_fixed(treasury_cap);
    coin_registry::finalize_and_delete_metadata_cap(currency, ctx);

    transfer::public_transfer(initial_supply, ctx.sender());
}

#[test]
fun initial_supply_uses_nine_decimal_base_units() {
    assert!(TOTAL_SUPPLY == 999_999 * BASE_UNITS, 0);
    assert!(TOTAL_SUPPLY / BASE_UNITS == 999_999, 1);
    assert!(TOTAL_SUPPLY % BASE_UNITS == 0, 2);
}
