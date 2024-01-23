use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}

validator(
  marloweAddress: Address,
  charli3Address: Address,
  charli3PolicyId: PolicyId,
  charli3TokenName: AssetName,
  choiceName: ByteArray,
) {
  fn charli3_bridge(datum: Data, redeemer: Data, ctx: ScriptContext) -> Bool {
    True
  }
}

validator(
  marloweAddress: Address,
  orcfaxAddress: Address,
  orcfaxPolicyId: PolicyId,
  choiceName: ByteArray,
) {
  fn orcfax_bridge(datum: Data, redeemer: Data, ctx: ScriptContext) -> Bool {
    True
  }
}
