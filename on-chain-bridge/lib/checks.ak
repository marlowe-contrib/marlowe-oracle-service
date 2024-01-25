use aiken/dict
use aiken/list
use aiken/transaction.{InlineDatum, Output, Redeemer, ScriptContext, Spend}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use types.{AssetClass, ChoiceDict}

/// `lookup_and_check_bridge` function
///
/// The function looks for the bridge input and its continuing output.
///
/// # Parameters:
/// - `ctx`: The script context
///
/// # Returns
/// - The bridge's input and continuing output, the name of the bridge's role
/// token, and the thread token's asset class.
pub fn lookup_and_check_bridge(
  ctx: ScriptContext,
) -> Option<(Output, Output, AssetName, AssetClass)> {
  expect Spend(output_ref) = ctx.purpose
  expect Some(b_input) =
    ctx.transaction.inputs |> transaction.find_input(output_ref)
  expect Some(b_output) =
    ctx.transaction.outputs
      |> list.filter(fn(output) { output.address == b_input.output.address })
      |> list.head()
  expect InlineDatum(datum) = b_input.output.datum
  expect thread_token_name: ByteArray = datum
  let non_ada_asset_list =
    b_input.output.value
      |> value.without_lovelace()
      |> value.flatten()
  when non_ada_asset_list is {
    [] -> fail @"No non ada asset in bridge utxo"
    [(rt_policy, rt_name, _)] -> {
      let thread_asset_class =
        AssetClass { policy: rt_policy, name: thread_token_name }
      Some((b_input.output, b_output, rt_name, thread_asset_class))
    }
    _more_than_one -> fail @"More than one non ada asset in bridge utxo"
  }
}

/// `lookup_and_check_marlowe` function
///
/// This function checks if there's a marlowe input in the transaction, with a
/// corresponding redeemer.
///
/// # Parameters:
/// - `marlowe_address`: The address of the marlowe validator
/// - `ctx`: The script context
///
/// # Returns
/// - The marlowe `Output` and the corresponding redeemer inside a `Some` if
/// there's only one marlowe input in the transaction. `None` if there's no
/// marlowe input. Fails if there's more than one marlowe input.
pub fn lookup_and_check_marlowe(
  marlowe_address: Address,
  ctx: ScriptContext,
) -> Option<(Output, Redeemer)> {
  let marlowe_inputs =
    ctx.transaction.inputs
      |> list.filter(fn(input) { input.output.address == marlowe_address })

  when marlowe_inputs is {
    [] -> None
    [marlowe_input] -> {
      expect Some(marlowe_redeemer) =
        ctx.transaction.redeemers
          |> dict.get(Spend(marlowe_input.output_reference))
      Some((marlowe_input.output, marlowe_redeemer))
    }
    _more_than_one -> fail @"More than one marlowe input found"
  }
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

pub fn check_marlowe_has_thread_token(input: Output, ac: AssetClass) -> Bool {
  let thread_token_amount = input.value |> value.quantity_of(ac.policy, ac.name)
  thread_token_amount == 1
}

pub fn check_bridge_destroy_utxo(_datum: Data, _ctx: ScriptContext) -> Bool {
  False
}

pub fn check_choice(
  _tn: AssetName,
  _cd: ChoiceDict,
  _redeemer: Redeemer,
) -> Bool {
  False
}

test aaa() {
  True
}
