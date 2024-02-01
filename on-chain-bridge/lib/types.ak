use aiken/dict.{Dict}
use aiken/hash.{Blake2b_224, Hash}
use aiken/transaction/credential.{VerificationKey}
use aiken/transaction/value.{AssetName, PolicyId}

// Represents a unique class of asset in the Cardano network.
///
/// Each asset on the Cardano network is uniquely identified by its Policy ID and its Asset Name.
/// The combination of a Policy ID and an Asset Name is known as an Asset Class.
///
/// # Fields:
/// * `policy_id`   - The unique identifier of the monetary policy that governs the asset.
/// * `asset_name`  - The unique name of the asset within the policy.
pub type AssetClass {
  policy: PolicyId,
  name: AssetName,
}

pub type ChoiceDict =
  Dict<ByteArray, Int>

pub type BridgeDatum {
  pkh: Hash<Blake2b_224, VerificationKey>,
  token_name: ByteArray,
}

// Types needed to decode the Marlowe validator redeemer
pub type MarloweInput =
  List<MarloweTxInput>

pub type MarloweTxInput {
  TxInput { content: InputContent }
  MerkelizedTxInput { content: InputContent, hash: ByteArray }
}

pub type InputContent {
  IDeposit { party1: Party, party2: Party, token: Data, money: Int }
  IChoice { choice_id: ChoiceId, chosen_num: Int }
  INotify
}

pub type ChoiceId {
  choice_name: ByteArray,
  choice_party: Party,
}

pub type Party {
  PartyAddress { address: ByteArray }
  PartyRole { role: ByteArray }
}
