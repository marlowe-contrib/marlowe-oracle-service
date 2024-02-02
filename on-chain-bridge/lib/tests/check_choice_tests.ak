use aiken/bytearray
use aiken/dict
use checks
use tests/utils.{mk_choice_input, mk_choice_input_address}
use types.{INotify, MarloweInput, TxInput}

test check_choice_simple_case() {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [mk_choice_input(c_name: choice_name, role: tt_name, c_num: feed1)]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_feeds() {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1),
      mk_choice_input(c_name: choice_name_2, role: tt_name, c_num: feed2),
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_2_correct_1_ignored() {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1),
      mk_choice_input(c_name: choice_name_2, role: tt_name, c_num: feed2),
      mk_choice_input(c_name: "Not Orcfax", role: tt_name, c_num: feed2),
    ]
  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_1_correct_1_wrong() fail {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1),
      mk_choice_input(c_name: choice_name_2, role: tt_name, c_num: feed1),
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_multiple_1_correct() {
  let tt_name = "Orcfax Oracle"
  let choice_name_1 = "Orcfax ADAUSD"
  let choice_name_2 = "Orcfax USDADA"
  let feed1 = 495120
  let feed2 = 201971
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name_1, value: feed1, compare: bytearray.compare)
      |> dict.insert(key: choice_name_2, value: feed2, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [mk_choice_input(c_name: choice_name_1, role: tt_name, c_num: feed1)]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_party() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input_address(
        choice_name,
        "addr_test1vzuqvqzcnuy9pmrh2sy7tjucufmpwh8gzssz7v6scn0e04gxdvna9",
        feed1,
      ),
      TxInput { content: INotify },
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_role_name() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name, role: "Fake Role", c_num: feed1),
      TxInput { content: INotify },
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_choice_name() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: "Not Charli3", role: tt_name, c_num: feed1),
      TxInput { content: INotify },
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_wrong_value() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name, role: tt_name, c_num: 100),
      TxInput { content: INotify },
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_no_choices() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      TxInput { content: INotify },
      TxInput { content: INotify },
      TxInput { content: INotify },
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}

test check_choice_1_correct_1_wrong_value() fail {
  let tt_name = "Charli3 Oracle"
  let choice_name = "Charli3 ADAUSD"
  let feed1 = 495120
  let c_dict =
    dict.new()
      |> dict.insert(key: choice_name, value: feed1, compare: bytearray.compare)
  let redeemer: MarloweInput =
    [
      mk_choice_input(c_name: choice_name, role: tt_name, c_num: 100),
      mk_choice_input(c_name: choice_name, role: tt_name, c_num: feed1),
      TxInput { content: INotify },
    ]

  checks.check_choice(tt_name, c_dict, redeemer)
}
