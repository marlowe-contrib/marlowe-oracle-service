use aiken/dict
use aiken/list
use aiken/option
use aiken/transaction.{
  InlineDatum, Input, Output, Redeemer, ScriptContext, Spend, Transaction,
}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use types.{
  AssetClass, BridgeDatum, ChoiceDict, ChoiceId, IChoice, MarloweInput,
  PartyRole, TxInput,
}

/// `lookup_and_check_bridge` function
///
/// The function looks for the bridge input and its continuing output, and makes
/// that they are unique.
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
  expect Some(input) =
    ctx.transaction.inputs |> transaction.find_input(output_ref)
  let b_inputs =
    ctx.transaction.inputs
      |> list.filter(fn(in) { in.output.address == input.output.address })
  let b_input =
    when b_inputs is {
      [in] -> in.output
      _more_than_one -> fail @"More than one bridge input"
    }
  let b_outputs =
    ctx.transaction.outputs
      |> list.filter(fn(output) { output.address == b_input.address })
  let b_output =
    when b_outputs is {
      [] -> fail @"No continuing output found"
      [out] -> out
      _more_than_one -> fail @"More than one bridge output"
    }

  expect InlineDatum(datum) = b_input.datum
  expect b_datum: BridgeDatum = datum
  let non_ada_asset_list =
    b_input.value
      |> value.without_lovelace()
      |> value.flatten()
  when non_ada_asset_list is {
    [] -> fail @"No non ada asset in bridge utxo"
    [(rt_policy, rt_name, 1)] -> {
      let thread_asset_class =
        AssetClass { policy: rt_policy, name: b_datum.token_name }
      Some((b_input, b_output, rt_name, thread_asset_class))
    }
    _more_than_one -> fail @"More than one non ada asset in bridge utxo"
  }
}

/// `lookup_and_check_marlowe` function
///
/// This function checks if there's a marlowe input in the transaction, with a
/// corresponding redeemer. For a True redeemer, exactly one Marlowe input is expected.
/// For a False redeemer, no Marlowe input is expected.
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

/// function `check_bridge_utxo`
///
/// This function is responsible for the validations regarding the bridge utxo
/// Those validations are the following:
/// - The value and the datum of the bridge utxo remains the same in its
/// cointinuing output
/// - There is exactly one non-ada token in the bridge utxo (it is presumed to
/// be the role token)
///
/// # Parameters:
/// - `input`: the bridge's input utxo
/// - `output`: the bridge's output utxo
///
/// # Returns
/// - True if the aforementioned conditions are met
pub fn check_bridge_utxo(input: Output, output: Output) -> Bool {
  let value_same = input.value == output.value
  let datum_same = input.datum == output.datum
  let address_same = input.address == output.address
  expect None = input.reference_script
  expect None = output.reference_script
  let one_non_ada_asset =
    (
      input.value
        |> value.without_lovelace()
        |> value.flatten
        |> list.length()
    ) == 1
  value_same? && datum_same? && address_same? && one_non_ada_asset?
}

pub fn check_marlowe_has_thread_token(input: Output, ac: AssetClass) -> Bool {
  let thread_token_amount = input.value |> value.quantity_of(ac.policy, ac.name)
  thread_token_amount == 1
}

/// function `check_bridge_destroy_utxo`
///
/// This function is responsible for the validations that happen when the
/// redeemer is false. Those validations are the following:
/// - The pubkey hash contained in the datum is signing the transaction
/// - No marlowe contract input is present
/// - All non-ada tokens in the bridge UTxO are burnt
///
/// # Parameters:
/// - `datum`: Holds the PubKeyHash that has the power to consume the bridge utxo
/// - `ctx`: The script context
///
/// # Returns
/// - True if the aforementioned conditions are met
pub fn check_bridge_destroy_utxo(datum: Data, ctx: ScriptContext) -> Bool {
  expect b_datum: BridgeDatum = datum

  let signer_is_in_datum =
    list.has(ctx.transaction.extra_signatories, b_datum.pkh)

  expect Spend(output_ref) = ctx.purpose
  expect Some(b_input) =
    ctx.transaction.inputs |> transaction.find_input(output_ref)
  expect None =
    ctx.transaction.outputs
      |> list.filter(fn(output) { output.address == b_input.output.address })
      |> list.head()

  let non_ada_in_bridge = b_input.output.value |> value.without_lovelace()

  let non_ada_assets_are_burnt =
    ctx.transaction.mint
      |> value.from_minted_value()
      |> value.merge(non_ada_in_bridge)
      |> value.is_zero

  signer_is_in_datum? && non_ada_assets_are_burnt?
}

/// `check_choice` function
///
/// This function checks if the choices contained in the marlowe redeemer are
/// valid.
///
/// # Parameters:
/// - `tn`: AssetName of the role token that the bridge has
/// - `cd`: ChoiceDict storing the feed values
/// - `redeemer`: Raw redeemer of the Marlowe validator
///
/// # Returns
/// This function returns true if there's **at least one** choice that has:
/// - 1) ChoiceOwner equal to the `tn` parameter
/// - 2) ChoiceName that appears as a key in the `cd` Dict
///
/// And all choices that satisfy 1 and 2, also satisfy:
/// - 3) ChosenNumber is equal to the value stored in the `cd` at the
///          ChoiceName key
pub fn check_choice(tn: AssetName, cd: ChoiceDict, redeemer: Redeemer) -> Bool {
  expect marlowe_input: MarloweInput = redeemer
  let our_choices =
    marlowe_input
      |> list.filter_map(
           fn(input) {
             when input is {
               TxInput(IChoice(ChoiceId(c_name, PartyRole(role)), c_number)) ->
                 if role == tn {
                   cd |> dict.get(c_name) |> option.map2(Some(c_number), ==)
                 } else {
                   None
                 }
               _other_cases -> None
             }
           },
         )

  list.length(our_choices) > 0 && list.all(our_choices, fn(a) { a })
}
