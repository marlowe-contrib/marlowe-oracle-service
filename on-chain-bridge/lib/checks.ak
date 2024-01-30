use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/option
use aiken/transaction.{
  InlineDatum, Input, Output, OutputReference, Redeemer, ScriptContext, Spend,
  Transaction, TransactionId,
}
use aiken/transaction/credential.{
  Address, ScriptCredential, VerificationKeyCredential,
}
use aiken/transaction/value.{AssetName, MintedValue, PolicyId, Value}
use types.{
  AssetClass, BridgeDatum, ChoiceDict, ChoiceId, IChoice, INotify, MarloweInput,
  MarloweTxInput, PartyAddress, PartyRole, TxInput,
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
    [(rt_policy, rt_name, _)] -> {
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

/// function `check_bridge_destroy_utxo`
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
  let one_non_ada_asset =
    (
      input.value
        |> value.without_lovelace()
        |> value.flatten
        |> list.length()
    ) == 1
  value_same? && datum_same? && one_non_ada_asset?
}

test check_bridge_more_than_1_non_ada_asset() fail {
  let bridge_value =
    value.from_lovelace(1000000)
      |> value.add(#"01", "Oracle role", 1)
      |> value.add(#"02", "Oracle role", 1)
  let input = mk_output()
  let bad_input = Output { ..input, value: bridge_value }

  check_bridge_utxo(bad_input, bad_input)
}

test check_bridge_datum_changed() fail {
  let bad_datum = BridgeDatum { pkh: #"02", token_name: "Other Token" }
  let input = mk_output()
  let bad_output = Output { ..input, datum: InlineDatum(bad_datum) }
  check_bridge_utxo(input, bad_output)
}

test check_bridge_value_changed() fail {
  let bad_value = value.from_lovelace(1000000)
  let input = mk_output()
  let bad_output = Output { ..input, value: bad_value }
  check_bridge_utxo(input, bad_output)
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

test check_bridge_destroy_utxo_1_non_ada_asset_is_burnt() {
  let datum = BridgeDatum { pkh: #"01", token_name: "Thread Token" }
  let one_non_ada_asset: Value =
    value.zero()
      |> value.add(#"02", "Oracle token", 1)

  let mint: MintedValue =
    value.negate(one_non_ada_asset)
      |> value.to_minted_value()
  let context = mk_script_context(one_non_ada_asset, mint, datum)
  check_bridge_destroy_utxo(datum, context)
}

test check_bridge_destroy_utxo_2_non_ada_asset_is_burnt() {
  let datum = BridgeDatum { pkh: #"01", token_name: "Thread Token" }
  let two_non_ada_asset: Value =
    value.zero()
      |> value.add(#"02", "Oracle token", 1)
      |> value.add(#"03", "Thread token", 1)

  let mint: MintedValue =
    value.negate(two_non_ada_asset)
      |> value.to_minted_value()

  let context = mk_script_context(two_non_ada_asset, mint, datum)

  check_bridge_destroy_utxo(datum, context)
}

test check_bridge_destroy_utxo_non_ada_asset_isnt_burnt() fail {
  let datum = BridgeDatum { pkh: #"01", token_name: "Thread Token" }
  let one_non_ada_asset: Value =
    value.zero()
      |> value.add(#"02", "Oracle token", 1)
  let no_mint: MintedValue = value.from_lovelace(0) |> value.to_minted_value()

  let context = mk_script_context(one_non_ada_asset, no_mint, datum)

  check_bridge_destroy_utxo(datum, context)
}

test check_bridge_destroy_utxo_wrong_signer() fail {
  let datum = BridgeDatum { pkh: #"01", token_name: "Thread Token" }
  let bad_datum = BridgeDatum { pkh: #"00", token_name: "Thread Token" }

  let one_non_ada_asset: Value =
    value.zero()
      |> value.add(#"02", "Oracle token", 1)
  let mint: MintedValue =
    value.negate(one_non_ada_asset)
      |> value.to_minted_value()

  let context = mk_script_context(one_non_ada_asset, mint, datum)

  check_bridge_destroy_utxo(bad_datum, context)
}

test check_bridge_destroy_utxo_continuing_output() fail {
  let placeholder_utxo =
    OutputReference { transaction_id: TransactionId(""), output_index: 0 }

  let placeholder_address =
    Address {
      payment_credential: VerificationKeyCredential(#"00"),
      stake_credential: None,
    }
  let datum = BridgeDatum { pkh: #"01", token_name: "Thread Token" }

  let one_non_ada_asset: Value =
    value.zero()
      |> value.add(#"02", "Oracle token", 1)
  let mint: MintedValue =
    value.negate(one_non_ada_asset)
      |> value.to_minted_value()

  let output =
    Output {
      address: placeholder_address,
      value: one_non_ada_asset,
      datum: InlineDatum(datum),
      reference_script: None,
    }

  let context =
    ScriptContext {
      purpose: Spend(placeholder_utxo),
      transaction: transaction.placeholder()
        |> fn(transaction) {
             Transaction { ..transaction, extra_signatories: [datum.pkh] }
           }
        |> fn(transaction) {
             Transaction {
               ..transaction,
               inputs: [Input { output_reference: placeholder_utxo, output }],
             }
           }
        |> fn(transaction) { Transaction { ..transaction, mint: mint } }
        |> fn(transaction) { Transaction { ..transaction, outputs: [output] } },
    }
  check_bridge_destroy_utxo(datum, context)
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

test check_choice_simple_case() {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [mk_choice_input(c_name: choice_name, role: tt_name, c_num: feed1)]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_feeds() {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1),
      mk_choice_input(c_name: choice_name_2, role: tt_name, c_num: feed2),
    ]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_2_correct_1_ignored() {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1),
      mk_choice_input(c_name: choice_name_2, role: tt_name, c_num: feed2),
      mk_choice_input(c_name: "Not Orcfax", role: tt_name, c_num: feed2),
    ]
  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_1_correct_1_wrong() fail {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1),
      mk_choice_input(c_name: choice_name_2, role: tt_name, c_num: feed1),
    ]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_1_correct() {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1)]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_party() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input_address(
        choice_name,
        "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9",
        feed1,
      ),
      TxInput { content: INotify },
    ]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_role_name() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name, role: "Fake Role", c_num: feed1),
      TxInput { content: INotify },
    ]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_choice_name() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: "Not Charli3", role: tt_name, c_num: feed1),
      TxInput { content: INotify },
    ]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_value() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name, role: tt_name, c_num: 100),
      TxInput { content: INotify },
    ]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_no_choices() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      TxInput { content: INotify },
      TxInput { content: INotify },
      TxInput { content: INotify },
    ]

  check_choice(tt_name, c_dict, redeemer)
}

test check_choice_1_correct_1_wrong_value() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name, role: tt_name, c_num: 100),
      mk_choice_input(c_name: choice_name, role: tt_name, c_num: feed1),
      TxInput { content: INotify },
    ]

  check_choice(tt_name, c_dict, redeemer)
}

fn mk_choice_input(
  c_name: ByteArray,
  role: AssetName,
  c_num: Int,
) -> MarloweTxInput {
  TxInput {
    content: IChoice {
      choice_id: ChoiceId {
        choice_name: c_name,
        choice_party: PartyRole { role },
      },
      chosen_num: c_num,
    },
  }
}

fn mk_choice_input_address(
  c_name: ByteArray,
  address: ByteArray,
  c_num: Int,
) -> MarloweTxInput {
  TxInput {
    content: IChoice {
      choice_id: ChoiceId {
        choice_name: c_name,
        choice_party: PartyAddress { address },
      },
      chosen_num: c_num,
    },
  }
}

fn mk_output() -> Output {
  let bridge_address =
    Address {
      payment_credential: ScriptCredential("0"),
      stake_credential: None,
    }
  let bridge_datum = BridgeDatum { pkh: #"01", token_name: "Thread Token" }
  let bridge_value =
    value.from_lovelace(1000000)
      |> value.add(#"01", "Oracle role", 1)
  Output {
    address: bridge_address,
    value: bridge_value,
    datum: InlineDatum(bridge_datum),
    reference_script: None,
  }
}

fn mk_script_context(v: Value, m: MintedValue, d: BridgeDatum) -> ScriptContext {
  let placeholder_utxo =
    OutputReference { transaction_id: TransactionId(""), output_index: 0 }

  let placeholder_address =
    Address {
      payment_credential: VerificationKeyCredential(#"00"),
      stake_credential: None,
    }

  ScriptContext {
    purpose: Spend(placeholder_utxo),
    transaction: transaction.placeholder()
      |> fn(transaction) {
           Transaction { ..transaction, extra_signatories: [d.pkh] }
         }
      |> fn(transaction) {
           Transaction {
             ..transaction,
             inputs: [
               Input {
                 output_reference: placeholder_utxo,
                 output: Output {
                   address: placeholder_address,
                   value: v,
                   datum: InlineDatum(d),
                   reference_script: None,
                 },
               },
             ],
           }
         }
      |> fn(transaction) { Transaction { ..transaction, mint: m } },
  }
}
