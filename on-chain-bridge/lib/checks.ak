use aiken/transaction.{Output, Redeemer, ScriptContext}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use types.{AssetClass, ChoiceDict}

pub fn lookup_and_check_bridge(
  ctx: ScriptContext,
) -> Option<(Output, Output, AssetName, AssetClass)> {
  todo
}

pub fn lookup_and_check_marlowe(
  marlowe_address: Address,
  ctx: ScriptContext,
) -> Option<(Output, Redeemer)> {
  todo
}

pub fn lookup_charli3_feed(
  c3_addr: Address,
  c3_policy_id: PolicyId,
  c3_token_name: AssetName,
  ctx: ScriptContext,
) -> Option<Int> {
  todo
}

pub fn lookup_orcfax_feed(
  orcfax_addr: Address,
  orcfax_policy_id: PolicyId,
  ctx: ScriptContext,
) -> Option<(Int, Int)> {
  todo
}

pub fn check_bridge_utxo(
  input: Output,
  output: Output,
  ctx: ScriptContext,
) -> Bool {
  todo
}

pub fn check_marlowe_has_thread_token(input: Output, ac: AssetClass) -> Bool {
  todo
}

pub fn check_bridge_destroy_utxo(datum: Data, ctx: ScriptContext) -> Bool {
  todo
}

pub fn check_choice(tn: AssetName, cd: ChoiceDict, redeemer: Redeemer) -> Bool {
  todo
}
