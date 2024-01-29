use aiken/dict.{Dict}
use aiken/hash.{Blake2b_224, Hash}
use aiken/int
use aiken/time.{PosixTime}
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

// Types to decode the Charli3 Datum
pub type C3Datum {
  info: C3Info,
}

pub type C3Info {
  SharedData(Data)
  ExtendedData(Data)
  Prices(Dict<Int, Int>)
}

pub type Price {
  price: Int,
  invalid_before: PosixTime,
  invalid_hereafter: PosixTime,
}

/// Creates the dictionary that is stored in the c3 datum given the neccessary
///  information
///
/// # Parameters:
/// - `price`: The feed price
/// - `invalid_before`: The PosixTime where the feed starts to be valid
/// - `invalid_hereafter`: The PosixTime where the feed stops being valid
///
/// # Returns
/// - The Dict to be stored in the datum with the correct keys
pub fn create_price_dict(
  price: Int,
  invalid_before: PosixTime,
  invalid_hereafter: PosixTime,
) -> Dict<Int, Int> {
  dict.new()
    |> dict.insert(0, price, int.compare)
    |> dict.insert(1, invalid_before, int.compare)
    |> dict.insert(2, invalid_hereafter, int.compare)
}

/// Parses the dictionary that is stored in the c3 datum.
///
/// # Parameters:
/// - `p_dict`: The Dict as it's stored in the datum
///
/// # Returns
/// - The price, invalid_before and invalid_hereafter information contained in
///    the dictionary
pub fn parse_price_dict(p_dict: Dict<Int, Int>) -> Price {
  expect Some(price) = dict.get(p_dict, 0)
  expect Some(invalid_before) = dict.get(p_dict, 1)
  expect Some(invalid_hereafter) = dict.get(p_dict, 2)

  Price { price, invalid_before, invalid_hereafter }
}
