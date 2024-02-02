use aiken/list
use aiken/transaction.{Input, Output, ScriptContext, Transaction}
use aiken/transaction/value
use checks
use tests/utils.{mk_script_context}
use types.{AssetClass}

test lookup_and_check_bridge_more_than_1_input() fail {
  let base_ctx = mk_script_context(False)
  expect Some(input) = base_ctx.transaction.inputs |> list.at(0)
  let ctx =
    ScriptContext {
      purpose: base_ctx.purpose,
      transaction: Transaction {
        ..base_ctx.transaction,
        inputs: list.concat(base_ctx.transaction.inputs, [input]),
      },
    }
  let asset_class = AssetClass { policy: #"01", name: "Thread Token" }
  Some((input.output, input.output, "Oracle token", asset_class)) == checks.lookup_and_check_bridge(
    ctx,
  )
}

test lookup_and_check_bridge_more_than_1_output() fail {
  let base_ctx = mk_script_context(False)
  expect Some(output) = base_ctx.transaction.outputs |> list.at(0)
  let ctx =
    ScriptContext {
      purpose: base_ctx.purpose,
      transaction: Transaction {
        ..base_ctx.transaction,
        outputs: list.concat(base_ctx.transaction.outputs, [output]),
      },
    }
  let asset_class = AssetClass { policy: #"01", name: "Thread Token" }
  Some((output, output, "Oracle token", asset_class)) == checks.lookup_and_check_bridge(
    ctx,
  )
}

test lookup_and_check_bridge_more_than_one_non_ada_asset() fail {
  let base_ctx = mk_script_context(False)
  expect Some(in) = base_ctx.transaction.inputs |> list.at(0)
  expect Some(m_in) = base_ctx.transaction.inputs |> list.at(1)
  let bad_input =
    Input {
      ..in,
      output: Output {
        ..in.output,
        value: value.merge(in.output.value, in.output.value),
      },
    }

  let ctx =
    ScriptContext {
      purpose: base_ctx.purpose,
      transaction: Transaction {
        ..base_ctx.transaction,
        inputs: [bad_input, m_in],
      },
    }
  let asset_class = AssetClass { policy: #"01", name: "Thread Token" }
  Some((bad_input.output, bad_input.output, "Oracle token", asset_class)) == checks.lookup_and_check_bridge(
    ctx,
  )
}
