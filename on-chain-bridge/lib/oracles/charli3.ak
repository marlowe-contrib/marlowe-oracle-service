use aiken/cbor
use aiken/dict.{Dict}
use aiken/int
use aiken/interval
use aiken/list
use aiken/time.{PosixTime}
use aiken/transaction.{Datum, InlineDatum, Input, ScriptContext}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}

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

test check_charli3_datum_encoding() {
  let correct_cbor =
    #"d8799fd87b9fa3001a00078e10011b0000018d233537b5021b0000018d2350aef5ffff"
  let mock_datum: C3Datum =
    C3Datum(
      Prices(
        create_price_dict(
          price: 495120,
          invalid_before: 1705692706741,
          invalid_hereafter: 1705694506741,
        ),
      ),
    )
  cbor.serialise(mock_datum) == correct_cbor
}

/// `lookup_charli3_feed` function
///
/// This function checks if there's a single charli3 reference input in the
/// transaction. It parses it's datum and returns the feed price if it valid
///
/// # Parameters:
/// - `c3_addr`: The address of the charli3 validator
/// - `c3_policy_id`: The policy ID of the charli3 tokens corresponding to the
///     feed we are looking for
/// - `c3_token_name`: The token name of the charli3 token corresponding to the
///     feed we are looking for
/// - `ctx`: The script context
///
/// # Returns
/// - The feed price if it is contained in the datum and it's valid,according to
///    the tx validity interval.
pub fn lookup_charli3_feed(
  c3_addr: Address,
  c3_policy_id: PolicyId,
  c3_token_name: AssetName,
  ctx: ScriptContext,
) -> Int {
  expect [c3_input]: List<Input> =
    ctx.transaction.reference_inputs
      |> list.filter(fn(input) { input.output.address == c3_addr })
  expect 1 =
    c3_input.output.value |> value.quantity_of(c3_policy_id, c3_token_name)

  expect InlineDatum(d): Datum = c3_input.output.datum
  expect C3Datum(Prices(p_dict)): C3Datum = d

  let Price(price, invalid_before, invalid_hereafter) = parse_price_dict(p_dict)

  let validity_interval = ctx.transaction.validity_range
  let cb = interval.is_entirely_before(validity_interval, invalid_hereafter)
  let ca = interval.is_entirely_after(validity_interval, invalid_before)

  if ca? && cb? {
    price
  } else {
    fail @"Found c3 feed but it's expired or not valid yet"
  }
}
