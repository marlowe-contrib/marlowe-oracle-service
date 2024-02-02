use aiken/dict
use aiken/list
use aiken/transaction.{ScriptContext, Transaction}
use aiken/transaction/credential.{Address, ScriptCredential}
use checks
use tests/utils.{mk_choice_input, mk_script_context}

test lookup_and_check_marlowe_no_input() {
  let marlowe_address =
    Address {
      payment_credential: ScriptCredential("99"),
      stake_credential: None,
    }
  let base_ctx = mk_script_context(True)
  expect Some(in) = base_ctx.transaction.inputs |> list.at(0)
  let ctx =
    ScriptContext {
      ..base_ctx,
      transaction: Transaction { ..base_ctx.transaction, inputs: [in] },
    }
  None == checks.lookup_and_check_marlowe(marlowe_address, ctx)
}

test lookup_and_check_marlowe_more_than_one_input() fail {
  let redeemer: Data =
    [
      mk_choice_input(
        c_name: "Oracle ADAUSD",
        role: "Oracle Token",
        c_num: 495120,
      ),
    ]
  let marlowe_address =
    Address {
      payment_credential: ScriptCredential("99"),
      stake_credential: None,
    }

  let base_ctx = mk_script_context(True)
  expect Some(m_in) = base_ctx.transaction.inputs |> list.at(1)
  let ctx =
    ScriptContext {
      ..base_ctx,
      transaction: Transaction {
        ..base_ctx.transaction,
        inputs: list.concat([m_in], base_ctx.transaction.inputs),
      },
    }
  Some((m_in.output, redeemer)) == checks.lookup_and_check_marlowe(
    marlowe_address,
    ctx,
  )
}

test lookup_and_check_marlowe_no_redeemer() fail {
  let redeemer: Data =
    [
      mk_choice_input(
        c_name: "Oracle ADAUSD",
        role: "Oracle Token",
        c_num: 495120,
      ),
    ]
  let marlowe_address =
    Address {
      payment_credential: ScriptCredential("99"),
      stake_credential: None,
    }

  let base_ctx = mk_script_context(True)
  expect Some(m_in) = base_ctx.transaction.inputs |> list.at(1)
  let ctx =
    ScriptContext {
      ..base_ctx,
      transaction: Transaction { ..base_ctx.transaction, redeemers: dict.new() },
    }
  Some((m_in.output, redeemer)) == checks.lookup_and_check_marlowe(
    marlowe_address,
    ctx,
  )
}
