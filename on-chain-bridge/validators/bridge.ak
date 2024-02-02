use aiken/bytearray
use aiken/dict
use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use checks.{
  check_bridge_destroy_utxo, check_bridge_utxo, check_choice,
  check_marlowe_has_thread_token, lookup_and_check_bridge,
  lookup_and_check_marlowe,
}
use oracles/charli3.{lookup_charli3_feed}
use oracles/orcfax.{lookup_orcfax_feed}
use types.{ChoiceDict}

validator(
  marlowe_address: Address,
  charli3_address: Address,
  charli3_policy_id: PolicyId,
  charli3_token_name: AssetName,
  choice_name: ByteArray,
) {
  fn charli3_bridge(datum: Data, redeemer: Bool, ctx: ScriptContext) -> Bool {
    let opt_marlowe = lookup_and_check_marlowe(marlowe_address, ctx)
    if redeemer {
      expect Some((input_marlowe, redeemer_marlowe)) = opt_marlowe
      expect Some((input_bridge, output_bridge, tn_role_token, thread_token)) =
        lookup_and_check_bridge(ctx)
      let feed =
        lookup_charli3_feed(
          charli3_address,
          charli3_policy_id,
          charli3_token_name,
          ctx,
        )

      let choice_value_dict: ChoiceDict =
        dict.new()
          |> dict.insert(key: choice_name, value: feed, compare: bytearray.compare)

      let cb = check_bridge_utxo(input_bridge, output_bridge)
      let ctt = check_marlowe_has_thread_token(input_marlowe, thread_token)
      let cc = check_choice(tn_role_token, choice_value_dict, redeemer_marlowe)

      cb? && ctt? && cc?
    } else {
      expect None = opt_marlowe
      check_bridge_destroy_utxo(datum, ctx)?
    }
  }
}

validator(
  marlowe_address: Address,
  orcfax_address: Address,
  orcfax_policy_id: PolicyId,
  orcfax_feed_name: ByteArray,
  choice_names: (ByteArray, ByteArray),
) {
  fn orcfax_bridge(datum: Data, redeemer: Bool, ctx: ScriptContext) -> Bool {
    let opt_marlowe = lookup_and_check_marlowe(marlowe_address, ctx)
    if redeemer {
      expect Some((input_marlowe, redeemer_marlowe)) = opt_marlowe
      expect Some((input_bridge, output_bridge, tn_role_token, thread_token)) =
        lookup_and_check_bridge(ctx)
      let (feed_1, feed_2) =
        lookup_orcfax_feed(
          orcfax_address,
          orcfax_policy_id,
          orcfax_feed_name,
          ctx,
        )
      let (choice_name_1, choice_name_2) = choice_names

      let choice_value_dict: ChoiceDict =
        dict.new()
          |> dict.insert(
               key: choice_name_1,
               value: feed_1,
               compare: bytearray.compare,
             )
          |> dict.insert(
               key: choice_name_2,
               value: feed_2,
               compare: bytearray.compare,
             )

      let cb = check_bridge_utxo(input_bridge, output_bridge)
      let ctt = check_marlowe_has_thread_token(input_marlowe, thread_token)
      let cc = check_choice(tn_role_token, choice_value_dict, redeemer_marlowe)

      cb? && ctt? && cc?
    } else {
      expect None = opt_marlowe
      check_bridge_destroy_utxo(datum, ctx)?
    }
  }
}
