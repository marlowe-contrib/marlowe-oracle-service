use aiken/transaction.{InlineDatum, Output}
use aiken/transaction/value
use checks
use tests/utils.{mk_output}
use types.{BridgeDatum}

test check_bridge_more_than_1_non_ada_asset() fail {
  let bridge_value =
    value.from_lovelace(1000000)
      |> value.add(#"01", "Oracle Token", 1)
      |> value.add(#"02", "Oracle Token", 1)
  let input = mk_output("00", "")
  let bad_input = Output { ..input, value: bridge_value }

  checks.check_bridge_utxo(bad_input, bad_input)
}

test check_bridge_datum_changed() fail {
  let bad_datum = BridgeDatum { pkh: #"02", token_name: "Other Token" }
  let input = mk_output("00", "Oracle Token")
  let bad_output = Output { ..input, datum: InlineDatum(bad_datum) }
  checks.check_bridge_utxo(input, bad_output)
}

test check_bridge_value_changed() fail {
  let bad_value = value.from_lovelace(1000000)
  let input = mk_output("00", "Oracle Token")
  let bad_output = Output { ..input, value: bad_value }
  checks.check_bridge_utxo(input, bad_output)
}
