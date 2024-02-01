use aiken/dict.{Dict}
use aiken/list
use aiken/math
use aiken/option
use aiken/time.{PosixTime}

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
type TimeConstraints {
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
pub fn get_parsed_orcfax_datum(
  raw_datum: RawOrcfaxDatum,
) -> Option<ParsedOrcfaxDatum> {
  let o_name = get_orcfax_name(raw_datum)
  let o_values = get_orcfax_values(raw_datum)
  let o_val_reference = get_orcfax_reference(raw_datum)

  option.map3(o_name, o_values, o_val_reference, create_parsed_orcfax_datum)
}

/// `create_parsed_orcfax_datum` function
///
/// Helper function to create a ParsedOrcfaxDatum using option.map3
///
/// # Parameters:
/// - `name`: The orcfax feed name
/// - `feeds`: The 2 values stored in the feed
/// - `references`: The invalid before and Invalid hereafter tuple in that order
///
/// # Returns
/// - The ParsedOrcfaxDatum built with the provided data.
fn create_parsed_orcfax_datum(
  name: ByteArray,
  feeds: (Int, Int),
  references: (PosixTime, PosixTime),
) -> ParsedOrcfaxDatum {
  let (ib, ih) = references
  ParsedOrcfaxDatum { name, feeds, invalid_before: ib, invalid_hereafter: ih }
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
fn get_orcfax_name(raw_datum: RawOrcfaxDatum) -> Option<ByteArray> {
  let raw_dict = raw_datum.data
  dict.get(raw_dict, "name")
    |> option.map(
         fn(value) {
           expect name: ByteArray = value
           name
         },
       )
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
fn get_orcfax_values(raw_datum: RawOrcfaxDatum) -> Option<(Int, Int)> {
  let raw_dict = raw_datum.data
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

/// `get_orcfax_reference` function
///
/// Parses the invalid before and hereafter from the raw datum.
///
/// # Parameters:
/// - `raw_datum`: The raw orcfax datum.
///
/// # Returns
/// - The parsed invalid before and hereafter
fn get_orcfax_reference(
  raw_datum: RawOrcfaxDatum,
) -> Option<(PosixTime, PosixTime)> {
  let raw_dict = raw_datum.data
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
/// Parses the feed values stored in the significant, exponenet format.
///
/// # Parameters:
/// - `value`: The orcfax value.
///
/// # Returns
/// - The parsed feed number, if `value` is `Num` and exponent is negative.
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

/// `map_option` function
///
/// Given a list of options, drop the None elements and unwrap the Some elements
///
/// # Parameters:
/// - `l`: The list to map over.
///
/// # Returns
/// - The new list without options
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
