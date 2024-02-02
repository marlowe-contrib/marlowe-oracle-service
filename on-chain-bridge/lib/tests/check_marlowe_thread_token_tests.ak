use aiken/transaction.{Output}
use aiken/transaction/value
use checks
use tests/utils.{mk_output}
use types.{AssetClass}

test check_marlowe_has_thread_token_quantity_more_than_one() fail {
  let asset_class = AssetClass { policy: #"01", name: "Thread Token" }
  let output =
    mk_output("99", "Thread Token")
      |> fn(out) { Output { ..out, value: value.merge(out.value, out.value) } }

  checks.check_marlowe_has_thread_token(output, asset_class)
}

test check_marlowe_has_thread_token_wrong_asset_class() fail {
  let asset_class = AssetClass { policy: #"02", name: "Thread Token" }
  let output = mk_output("99", "Thread Token")

  checks.check_marlowe_has_thread_token(output, asset_class)
}

test check_marlowe_has_thread_token_no_token() fail {
  let asset_class = AssetClass { policy: #"01", name: "Thread Token" }
  let output =
    mk_output("99", "Thread Token")
      |> fn(out) { Output { ..out, value: value.from_lovelace(1000000) } }

  checks.check_marlowe_has_thread_token(output, asset_class)
}
