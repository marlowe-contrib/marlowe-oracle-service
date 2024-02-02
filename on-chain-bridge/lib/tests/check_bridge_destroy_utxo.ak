use aiken/list
use aiken/transaction.{Input, Output, ScriptContext, Transaction}
use aiken/transaction/value.{MintedValue, Value}
use checks
use tests/utils.{mk_script_context}
use types.{BridgeDatum}

test check_bridge_destroy_utxo_1_non_ada_asset_is_burnt() {
  let datum = BridgeDatum { pkh: #"02", token_name: "Thread Token" }
  let mint: MintedValue =
    value.zero()
      |> value.add(#"01", "Oracle Token", 1)
      |> value.negate()
      |> value.to_minted_value()
  let base_ctx = mk_script_context(True)
  let ctx =
    ScriptContext {
      ..base_ctx,
      transaction: Transaction { ..base_ctx.transaction, mint: mint },
    }
  checks.check_bridge_destroy_utxo(datum, ctx)
}

test check_bridge_destroy_utxo_2_non_ada_asset_is_burnt() {
  let datum = BridgeDatum { pkh: #"02", token_name: "Thread Token" }
  let base_ctx = mk_script_context(True)
  let non_ada_asset: Value =
    value.zero()
      |> value.add(#"03", "Thread token", 1)
  expect Some(in) = base_ctx.transaction.inputs |> list.at(0)
  let new_input =
    Input {
      ..in,
      output: Output {
        ..in.output,
        value: value.merge(in.output.value, non_ada_asset),
      },
    }
  expect Some(m_in) = base_ctx.transaction.inputs |> list.at(1)
  let mint: MintedValue =
    value.negate(new_input.output.value)
      |> value.to_minted_value()

  let ctx =
    ScriptContext {
      ..base_ctx,
      transaction: transaction.placeholder()
        |> fn(_tx) {
             Transaction {
               ..base_ctx.transaction,
               inputs: list.concat([new_input], [m_in]),
             }
           }
        |> fn(tx) { Transaction { ..tx, mint: mint } },
    }
  checks.check_bridge_destroy_utxo(datum, ctx)
}

test check_bridge_destroy_utxo_non_ada_asset_isnt_burnt() fail {
  let datum = BridgeDatum { pkh: #"02", token_name: "Thread Token" }
  let ctx = mk_script_context(True)

  checks.check_bridge_destroy_utxo(datum, ctx)
}

test check_bridge_destroy_utxo_wrong_signer() fail {
  let bad_datum = BridgeDatum { pkh: #"00", token_name: "Thread Token" }
  let ctx = mk_script_context(True)

  checks.check_bridge_destroy_utxo(bad_datum, ctx)
}

test check_bridge_destroy_utxo_continuing_output() fail {
  let datum = BridgeDatum { pkh: #"02", token_name: "Thread Token" }
  let base_ctx = mk_script_context(False)
  let ctx =
    ScriptContext {
      ..base_ctx,
      transaction: Transaction {
        ..base_ctx.transaction,
        extra_signatories: [datum.pkh],
      },
    }
  checks.check_bridge_destroy_utxo(datum, ctx)
}
