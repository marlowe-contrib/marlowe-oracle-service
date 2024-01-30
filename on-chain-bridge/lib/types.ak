use aiken/dict.{Dict}
use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/math
use aiken/option
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

// Types for orcfax datum parsing

pub type RawOrcfaxDatum {
  data: Dict<ByteArray, Data>,
}

pub type OrcfaxValue {
  True
  False
  Null
  Num { significand: Int, exponent: Int }
}

pub type ParsedOrcfaxDatum {
  name: ByteArray,
  invalid_before: PosixTime,
  invalid_hereafter: PosixTime,
  feeds: (Int, Int),
}

pub fn get_parsed_orcfax_datum(
  raw_datum: RawOrcfaxDatum,
) -> Option<ParsedOrcfaxDatum> {
  let o_name = get_orcfax_name(raw_datum)
  let o_values = get_orcfax_values(raw_datum)
  let o_val_reference = get_orcfax_reference(raw_datum)

  option.map3(o_name, o_values, o_val_reference, create_parsed_orcfax_datum)
}

fn create_parsed_orcfax_datum(
  name: ByteArray,
  feeds: (Int, Int),
  references: (PosixTime, PosixTime),
) -> ParsedOrcfaxDatum {
  let (ib, ih) = references
  ParsedOrcfaxDatum { name, feeds, invalid_before: ib, invalid_hereafter: ih }
}

fn get_orcfax_name(raw_datum: RawOrcfaxDatum) -> Option<ByteArray> {
  let RawOrcfaxDatum(raw_dict) = raw_datum
  dict.get(raw_dict, "name")
    |> option.map(
         fn(value) {
           expect name: ByteArray = value
           name
         },
       )
}

fn get_orcfax_values(raw_datum: RawOrcfaxDatum) -> Option<(Int, Int)> {
  let RawOrcfaxDatum(raw_dict) = raw_datum
  dict.get(raw_dict, "value")
    |> option.map(
         fn(value) {
           expect l: List<OrcfaxValue> = value
           let parsed_list =
             list.map(l, parse_orcfax_num)
               |> map_option
           when parsed_list is {
             [feed1, feed2] -> Some((feed1, feed2))
             _other -> None
           }
         },
       )
    |> option.flatten
}

fn get_orcfax_reference(
  raw_datum: RawOrcfaxDatum,
) -> Option<(PosixTime, PosixTime)> {
  let RawOrcfaxDatum(raw_dict) = raw_datum
  dict.get(raw_dict, "valueReference")
    |> option.map(
         fn(value) {
           expect o_val_ref: List<Dict<ByteArray, Data>> = value
           let ble: List<TimeConstraints> =
             list.map(o_val_ref, parse_orcfax_reference_dict) |> map_option
           when ble is {
             [ValidFrom(vf), ValidThrough(vt)] -> Some((vf, vt))
             [ValidThrough(vt), ValidFrom(vf)] -> Some((vf, vt))
             _otherwhise -> None
           }
         },
       )
    |> option.flatten
}

type TimeConstraints {
  ValidFrom(PosixTime)
  ValidThrough(PosixTime)
}

fn parse_orcfax_reference_dict(
  raw_dict: Dict<ByteArray, Data>,
) -> Option<TimeConstraints> {
  let o_name: Option<Data> = dict.get(raw_dict, "name")
  let o_value: Option<Data> = dict.get(raw_dict, "value")

  option.map2(
    o_name,
    o_value,
    fn(r_name, r_value) {
      expect name: ByteArray = r_name
      if name == "validFrom" {
        expect value: PosixTime = r_value
        Some(ValidFrom(value))
      } else if name == "validThrough" {
        expect value: PosixTime = r_value
        Some(ValidThrough(value))
      } else {
        None
      }
    },
  )
    |> option.flatten
}

fn parse_orcfax_num(value: OrcfaxValue) -> Option<Int> {
  when value is {
    Num(sig, exp) -> {
      let pow_2_64 = 18446744073709551616
      if exp < pow_2_64 {
        None
      } else {
        // The exponent from orcfax must be decoded as a signed 64bit number.
        // To do the conversion in a cheaper way, we can assume the number is
        // always negative and take the difference with 2^64. We then add 6
        // because of the MOS standard. Where a real value of 0.5 is displayed
        // as 500000
        let adjusted_exp = exp - pow_2_64 + 6
        let value: Int =
          if adjusted_exp >= 0 {
            sig * math.pow(10, adjusted_exp)
          } else {
            sig / math.pow(10, -adjusted_exp)
          }
        Some(value)
      }
    }
    _other -> None
  }
}

fn map_option(l: List<Option<a>>) -> List<a> {
  list.foldl(
    l,
    [],
    fn(elem, acc) {
      when elem is {
        Some(a) -> list.push(acc, a)
        None -> acc
      }
    },
  )
    |> list.reverse
}
