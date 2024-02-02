use aiken/dict
use aiken/transaction.{
  InlineDatum, Input, Output, OutputReference, ScriptContext, ScriptPurpose,
  Spend, Transaction, TransactionId,
}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{AssetName}
use types.{
  BridgeDatum, ChoiceId, IChoice, MarloweTxInput, PartyAddress, PartyRole,
  TxInput,
}

pub fn mk_choice_input(
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

pub fn mk_choice_input_address(
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

pub fn mk_output(addr: ByteArray, token: ByteArray) -> Output {
  let address =
    Address {
      payment_credential: ScriptCredential(addr),
      stake_credential: None,
    }
  let datum = BridgeDatum { pkh: #"02", token_name: "Thread Token" }
  let value =
    value.from_lovelace(1000000)
      |> value.add(#"01", token, 1)
  Output { address, value, datum: InlineDatum(datum), reference_script: None }
}

pub fn mk_script_context(destroy d: Bool) -> ScriptContext {
  let bridge_out_ref =
    OutputReference { transaction_id: TransactionId(""), output_index: 0 }

  let bridge_input =
    Input {
      output_reference: bridge_out_ref,
      output: mk_output("00", "Oracle Token"),
    }
  let marlowe_out_ref =
    OutputReference { transaction_id: TransactionId("123"), output_index: 1 }

  let marlowe_input =
    Input {
      output_reference: marlowe_out_ref,
      output: mk_output("99", "Thread Token"),
    }
  let redeemer_value: Data =
    [
      mk_choice_input(
        c_name: "Oracle ADAUSD",
        role: "Oracle Token",
        c_num: 495120,
      ),
    ]

  let redeemer =
    dict.new()
      |> dict.insert(
           key: Spend(marlowe_out_ref),
           value: redeemer_value,
           compare: compare,
         )

  let (outputs, signer) =
    when d is {
      True -> ([], [#"02"])
      _ -> ([bridge_input.output, marlowe_input.output], [])
    }

  ScriptContext {
    purpose: Spend(bridge_out_ref),
    transaction: transaction.placeholder()
      |> fn(transaction) {
           Transaction { ..transaction, inputs: [bridge_input, marlowe_input] }
         }
      |> fn(transaction) { Transaction { ..transaction, outputs: outputs } }
      |> fn(transaction) {
           Transaction { ..transaction, extra_signatories: signer }
         }
      |> fn(transaction) { Transaction { ..transaction, redeemers: redeemer } },
  }
}

fn compare(left: ScriptPurpose, right: ScriptPurpose) -> Ordering {
  expect Spend(l) = left
  expect Spend(r) = right
  if l.output_index < r.output_index {
    Less
  } else if l.output_index > r.output_index {
    Greater
  } else {
    Equal
  }
}
