use aiken/transaction.{Output, Redeemer, ScriptContext}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use types.{AssetClass, ChoiceDict}

pub fn lookup_and_check_bridge(
  _ctx: ScriptContext,
) -> Option<(Output, Output, AssetName, AssetClass)> {
  None
}

pub fn lookup_and_check_marlowe(
  _marlowe_address: Address,
  _ctx: ScriptContext,
) -> Option<(Output, Redeemer)> {
  None
}

pub fn lookup_charli3_feed(
  _c3_addr: Address,
  _c3_policy_id: PolicyId,
  _c3_token_name: AssetName,
  _ctx: ScriptContext,
) -> Option<Int> {
  None
}

pub fn lookup_orcfax_feed(
  _orcfax_addr: Address,
  _orcfax_policy_id: PolicyId,
  _ctx: ScriptContext,
) -> Option<(Int, Int)> {
  None
}

pub fn check_bridge_utxo(
  _input: Output,
  _output: Output,
  _ctx: ScriptContext,
) -> Bool {
  False
}

pub fn check_marlowe_has_thread_token(_input: Output, _ac: AssetClass) -> Bool {
  False
}

pub fn check_bridge_destroy_utxo(_datum: Data, _ctx: ScriptContext) -> Bool {
  False
}

pub fn check_choice(_tn: AssetName, _cd: ChoiceDict, _redeemer: Redeemer) -> Bool {
  False
}
