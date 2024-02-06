use aiken/dict.{Dict}
use aiken/interval
use aiken/list
use aiken/math
use aiken/option
use aiken/time.{PosixTime}
use aiken/transaction.{Datum, InlineDatum, Input, ScriptContext}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId}

/// This module implements types for orcfax datum parsing
/// The datum is mostly a representation of a JSON file, using a plutus data
/// dictionary with bytearray keys and different kind of values. We implement
/// functions to parse just the fields we are interested in.
pub type RawOrcfaxDatum {
  data: Dict<ByteArray, Data>,
  data_2: ByteArray,
  valid_through: TimeConstraints,
  data_3: ByteArray,
}

/// Type corresponding to the plutus data translation of JSON types explained
/// here: https://github.com/mlabs-haskell/cardano-open-oracle-protocol/blob/main/coop-docs/05-json-plutus.md
pub type OrcfaxValue {
  True
  False
  Null
  Num { significand: Int, exponent: Int }
}

/// The parsed data from the orcfax datum. Just what we need for validations
pub type ParsedOrcfaxDatum {
  name: ByteArray,
  invalid_before: PosixTime,
  invalid_hereafter: PosixTime,
  feeds: (Int, Int),
}

/// Encoding of the time constraints
pub type TimeConstraints {
  ValidFrom(PosixTime)
  ValidThrough(PosixTime)
}

/// `get_parsed_orcfax_datum` function
///
/// Main function to parse a raw datum into the neccesary data
///
/// # Parameters:
/// - `raw_datum`: The raw orcfax datum.
///
/// # Returns
/// - The relevant datum information if it could be parsed.
pub fn get_parsed_orcfax_datum(raw_datum: RawOrcfaxDatum) -> ParsedOrcfaxDatum {
  let name = get_orcfax_name(raw_datum)
  let values = get_orcfax_values(raw_datum)
  let val_reference = get_orcfax_reference(raw_datum)
  let (ib, ih) = val_reference

  ParsedOrcfaxDatum {
    name,
    feeds: values,
    invalid_before: ib,
    invalid_hereafter: ih,
  }
}

/// `get_orcfax_name` function
///
/// Parses the feed name from the raw datum.
///
/// # Parameters:
/// - `raw_datum`: The raw orcfax datum.
///
/// # Returns
/// - The parsed feed name
fn get_orcfax_name(raw_datum: RawOrcfaxDatum) -> ByteArray {
  let raw_dict = raw_datum.data
  expect Some(value) = dict.get(raw_dict, "name")
  expect name: ByteArray = value
  name
}

/// `get_orcfax_values` function
///
/// Parses the feed values from the raw datum.
///
/// # Parameters:
/// - `raw_datum`: The raw orcfax datum.
///
/// # Returns
/// - The parsed feed values
fn get_orcfax_values(raw_datum: RawOrcfaxDatum) -> (Int, Int) {
  let raw_dict = raw_datum.data
  expect Some(value) = dict.get(raw_dict, "value")
  expect l: List<OrcfaxValue> = value

  expect [feed1, feed2] = list.map(l, parse_orcfax_num)
  (feed1, feed2)
}

/// `get_orcfax_reference` function
///
/// Parses the invalid before and hereafter from the raw datum.
///
/// # Parameters:
/// - `raw_datum`: The raw orcfax datum.
///
/// # Returns
/// - The parsed invalid before and hereafter
fn get_orcfax_reference(raw_datum: RawOrcfaxDatum) -> (PosixTime, PosixTime) {
  let raw_dict = raw_datum.data
  expect Some(value) = dict.get(raw_dict, "valueReference")
  expect o_val_ref: List<Dict<ByteArray, Data>> = value

  let time_constraints: List<TimeConstraints> =
    list.map(o_val_ref, parse_orcfax_reference_dict)
      |> list.filter_map(fn(a) { a })

  when time_constraints is {
    [ValidFrom(vf), ValidThrough(vt)] -> (vf, vt)
    [ValidThrough(vt), ValidFrom(vf)] -> (vf, vt)
    _otherwhise -> fail @"error parsing orcfax reference"
  }
}

/// `parse_orcfax_reference_dict` function
///
/// Parses an inner value reference dictionary, looking for validFrom
/// or validThrough (also called invalid before and invalid hereafter) values.
///
/// # Parameters:
/// - `raw_datum`: The raw inner dict.
///
/// # Returns
/// - The parsed value, if any is found.
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

/// `parse_orcfax_num` function
///
/// Parses the feed values stored in the significant, exponent format.
///
/// # Parameters:
/// - `value`: The orcfax value.
///
/// # Returns
/// - The parsed feed number, if `value` is `Num` and exponent is negative.
fn parse_orcfax_num(value: OrcfaxValue) -> Int {
  expect Num(sig, exp) = value
  let pow_2_64 = 18446744073709551616
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
  value
}

/// `lookup_orcfax_feed` function
///
/// This function checks if there's a single orcfax reference input in the
/// transaction. It parses it's datum and returns the feed prices if it's valid
///
/// # Parameters:
/// - `orcfax_addr`: The address of the orcfax validator
/// - `orcfax_policy_id`: The policy ID of the orcfax tokens corresponding to the
///     feed we are looking for
/// - `orcfax_feed_name`: The feed name of the orcfax feed we are looking for
/// - `ctx`: The script context
///
/// # Returns
/// - The feed prices if they are contained in the datum and it's valid,
///    according to the tx validity interval.
pub fn lookup_orcfax_feed(
  orcfax_addr: Address,
  orcfax_policy_id: PolicyId,
  orcfax_feed_name: ByteArray,
  ctx: ScriptContext,
) -> (Int, Int) {
  expect [orcfax_input]: List<Input> =
    ctx.transaction.reference_inputs
      |> list.filter(fn(input) { input.output.address == orcfax_addr })

  expect 1 =
    orcfax_input.output.value
      |> value.tokens(orcfax_policy_id)
      |> dict.foldl(0, fn(_key, elem, acc) { acc + elem })

  expect InlineDatum(d): Datum = orcfax_input.output.datum
  expect raw_datum: RawOrcfaxDatum = d

  let p_datum: ParsedOrcfaxDatum = get_parsed_orcfax_datum(raw_datum)

  let validity_interval = ctx.transaction.validity_range
  let cb =
    interval.is_entirely_before(validity_interval, p_datum.invalid_hereafter)
  let ca = interval.is_entirely_after(validity_interval, p_datum.invalid_before)
  let cn = p_datum.name == orcfax_feed_name

  if ca? && cb? && cn? {
    p_datum.feeds
  } else {
    fail @"Found orcfax feed but it's expired, not valid yet or has a different name"
  }
}
