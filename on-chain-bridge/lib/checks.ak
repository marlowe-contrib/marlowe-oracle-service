use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/option
use aiken/transaction.{InlineDatum, Output, Redeemer, ScriptContext, Spend}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use types.{
  AssetClass, ChoiceDict, ChoiceId, IChoice, INotify, Input, MarloweInput,
  MarloweTxInput, PartyAddress, PartyRole,
}

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
               Input(IChoice(ChoiceId(c_name, PartyRole(role)), c_number)) ->
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

test check_choice_2_correct_1_ignored() {
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

test check_choice_1_correct_1_wrong() fail {
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
      Input { content: INotify },
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
      Input { content: INotify },
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
      Input { content: INotify },
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
      Input { content: INotify },
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
      Input { content: INotify },
      Input { content: INotify },
      Input { content: INotify },
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
      Input { content: INotify },
    ]

  check_choice(tt_name, c_dict, redeemer)
}

fn mk_choice_input(
  c_name: ByteArray,
  role: AssetName,
  c_num: Int,
) -> MarloweTxInput {
  Input {
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
  Input {
    content: IChoice {
      choice_id: ChoiceId {
        choice_name: c_name,
        choice_party: PartyAddress { address },
      },
      chosen_num: c_num,
    },
  }
}
