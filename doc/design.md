# Marlowe - Decentralized Oracle Integration

## 1. Using Oracles in a Marlowe Contract

Oracle services provide information from the real world inside the blockchain, making it available to smart contracts. In the EUTxO-model, these services usually put data into the blockchain in the Datum of some UTxOs. For making this decentralized, the oracle data is the result of a consensus between different participants who validate it. Examples of this kind of oracles include Charli3 and Orcfax.

In Marlowe contracts, the ability to have trusted information about currency exchange rates, interest rates and others is very useful. Although there is no specific language constructor for using oracles, Marlowe provides a way to obtain outsider input in a contract by using a Choice Action, which indicates that the execution will wait until some authorized entity provides the data.
Then, the way to implement the use of an oracle in Marlowe contracts is by choice actions following a convention: for indicating that the input comes from an oracle, the choice action must have a specific Choice Name and the Choice Owner (the authorized entity) must be the oracle provider.
The choice name has to be a keyword that the oracle service will recognize for knowing which data the contract asks for (an example is the exchange rate between ADA and USD, whose keyword could be ADAUSD). In the simplest version of an oracle service for Marlowe, the choice owner could be a specific trusted address that provides the information obtained from the external world. Another way to indicate who provides the information offers more possibilities and consists of using role tokens.
In any case, the only thing the Marlowe contract validates is that the information comes from the indicated address or that the transaction providing the information contains the role token as an input. In the next sections, we’ll review in more detail how this validation works and how on-chain oracles such as Charli3 and Orfax can be integrated with Marlowe.

## 2. Oracles in Marlowe: validations

Marlowe contracts all share a single validator and therefore a single address. We call “deploying a Marlowe contract” to the act of creating a new UTxO at the Marlowe address with the datum containing the contract code and the contract state. The contract state contains the following information:

- Accounts: a map indicating how much of the locked tokens correspond to each user involved in the contract.
- Choices: a map containing the resolved choices. A choice is resolved when a number for the ChoiceID (Choice Name + Choice Owner) is provided.
- BoundValues:  a map containing values that can be used in the contract. New values can be added using the Let action.
- MinTime: the biggest known StartTime for transactions that interacted with this contract.

Once a deployed Marlowe contract reaches the point where information from an Oracle is needed, it will stay in that state until the data is provided.

As explained in the last section, in Marlowe, a Choice action is used to request outside data, and using a specific combination of name and owner it can be stated that the data should be coming from an Oracle.

A choice action has 3 parameters:
- Choice Name: a string identifying this particular choice. It will be used in the rest of the contract to access the data of the Oracle.
- Choice Owner: indicates who can resolve the choice. There are two options: Address or Role.
- Choice Bounds: a list of closed intervals of integers. The provided number must lie inside any of them.

For the contract to continue, a valid transaction must be submitted. The transaction must consume the contract UTxO and provide, in the redeemer, the ChoiceID and the information (that must be a number) to resolve the choice using the correct format. The Marlowe validator will do the following checks:
The choice owner is involved in the transaction. If the owner was specified as an Address, that address must sign the transaction, on the other hand, if it was specified using a Role, the corresponding role token must be included in an input of the transaction.
The information provided is between at least one of the bounds.
The state is updated appropriately. This means a new entry is added to the choices map with the ChoiceID as the key and the information as the value.

As we can see, the mechanism to resolve choices fully trusts the Choice Owner about the data it receives. And there is no on-chain assurance about the accuracy of the value. It could be completely false or come from trusted, decentralized oracles. But to validate on-chain that they are, in fact, being used as sources, we must add a new script to the transaction. How exactly that would work is explained in the next section.

## 3. Integrating on-chain oracle data into Marlowe

In order to integrate Marlowe with decentralized oracles in a trustless way, we built a proposal based around the Marlowe<>Charli3 design document [^4].

The Marlowe Oracle Service (MOS) is a running service with the ability to query the blockchain for Marlowe contracts that require feeds. It is also capable of filtering the known feeds so it can build, balance, and submit transactions to provide these.
The MOS will provide feeds to the two kinds of choice parties: Address and Role. The address of the MOS will be publicly available. Thus, any choice with that address as a party can be resolved with a regular transaction that just completes a choice. On the other hand, if the party is a Role with a publicly known name, the transaction will also involve the consumption of a UTxO containing a validator that we call the Oracle Bridge validator. Consequently, there will be two main components: an Off-chain backend in charge of the scanning and transaction building, and an Oracle Bridge Validator.

The feeds the MOS initially supports are exchange rate prices (the only currently provided by Charli3 and Orcfax), but the modular implementation we propose allows for easy integration of new kinds of feeds.

### 3.1 Off-chain backend

The Marlowe Oracle Service will use the Marlowe Runtime service to get a list of active Marlowe contracts. Then, it will filter only the contracts that pass the following criteria:


It has a choice action that can be resolved.
The choice name is a valid feed name that the service knows how to provide.
The owner is either the service’s address or a role token.

Then, it will build, balance, and submit the transactions that resolve each contract. There are two ways to resolve a contract, depending on the type of choice owner. The resulting transaction and the data flow are different for each case.

#### Address choice owner

If the choice owner is an address, it is straightforward to query the data from the necessary source and input it into the redeemer.
The following graph shows the flow that the Marlowe Oracle service follows in this case.

The Marlowe Oracle Service queries Marlowe Runtime to obtain all the contracts (1), then filters those contracts to find one that asks for Oracle input (2). After determining what the source for the oracle should be, it queries for the requested feed (3). Then, this value and the contract are sent to the Runtime to apply the Choice input and obtain the unsigned transaction body (4). After that, the transaction is signed (5) and submitted (6).
The resulting transaction should follow this specification (Ignoring Cardano fee logic)

<!--  TX FLOW DIAGRAM GOES HERE -->

The specification of a transaction using only the address and no bridge validator.

<!--  TX SPECIFICATION DIAGRAM GOES HERE -->

#### Role token choice owner
For contracts that want to utilize decentralized oracles like Charli3 or Orcfax, it first needs to check if the role token is present at a UTxO of the bridge validator. Then, it needs to include in the transaction the bridge UTxO and the Oracle Feed UTxO as a reference input.
This is the adjusted flow diagram for the case in which the choice owner is determined by a role token.


The Marlowe Oracle Service queries Marlowe Runtime to obtain all the contracts (1), then filters them to find one that asks for Oracle input (2). It then queries the blockchain through the Chain Indexer to find the UTxOs of the Oracle Bridge validator (3), and filters those UTxOs to find the one with the corresponding Oracle role token (4). Then, the MOS queries the Chain Indexer again, but this time for the UTxO that holds the requested Oracle Feed (5). This value and the contract are sent to the Runtime to apply the Choice input and obtain the unsigned transaction body (6). The MOS adds the Bridge Validator UTxO as an input, and the Oracle Feed UTxO as a reference input to the transaction (7). After that, it is signed (8) and submitted (9).

The transaction will then follow this second specification (Ignoring Cardano fee logic):
<!--  TX FLOW DIAGRAM GOES HERE -->

The specification of a transaction using a role token, the bridge validator, and the oracle feed.
<!--  TX SPECIFICATION DIAGRAM GOES HERE -->

### 3.2 Charli3 and Orfax datum format
Clearly, the off-chain backend needs to be able to read the Oracle Feed UTxO’s datum to get the feed information that will be used as input for the Marlowe contract. The MOS knows how to read Charli3 and Orcfax feeds.

The Charli3 feed is well-specified by a CDDL [1], and it has a lot of flexibility. For our particular case, the relevant information is placed on a map, defined as price_map, and the important keys are 0, 1, and 2. Representing the price, the creation time, and the expiration time, respectively. For example, here we have an extract of the CDDL specification.

```javascript
price_map =
  { ? 0 : price        ; how many quote currency is received per base
                         currency spent
  , ? 1 : posixtime    ; unix timestamp related to when the price data
                         was created
  , ? 2 : posixtime    ; unix timestamp related to when the price data
                         is expired
  ...
  }
```

This map contemplates the possibility to have the base and quote information about the price feed, but it doesn't seem to be used according to the research we did, for instance on this transaction [^5] we can see we only have the 0, 1, and 2 fields.

The Orcfax feed, as far as we know, doesn’t have a CDDL specification but there is some good documentation [^2], together with some reading example implementation [^3]. The relevant information is placed in a very expressive map, from which the interesting keys for the MOS are Name, Value, and ValueReference. Representing the name of the feed, the price, and the validity interval, respectively. Each one of these keys is hexa encoded so. for instance, when extracting a relevant part from a transaction [^6] we have (for easy reading we added the conversion just above each relevant key and value)

```javascript
     Name
{ h'6E616D65':
             ADA-USD|USD-ADA
    h'4144412D5553447C5553442D414441',

    Value
h'76616C7565':
    [ 124([3592,18446744073709551612])
    , 124([27839643652561246,18446744073709551600])
    ],

         ValueReference
h'76616C75655265666572656E6365':
    [
     { h'4074797065': h'50726F706572747956616C7565',
                         validFrom
       h'6E616D65': h'76616C696446726F6D',
       h'76616C7565': 1700237627310
     },
     { h'4074797065': h'50726F706572747956616C7565',
                         validThrough
       h'6E616D65': h'76616C69645468726F756768',
       h'76616C7565': 1700241347310
    }
    ]
}
```

The price value format is expressed using scientific notation, so the price is split into significand and exponent.

### 3.3 Oracle Bridge Validator

The bridge validator will have the responsibility to ensure that decentralized oracles are used effectively when a Marlowe contract requires it. It will have the following parameters:
- The hash of the Marlowe validator
- The currency symbol for the token held in the oracle's reference UTxO.
- The token name for the token held in the oracle's reference UTxO.
- The name of the Marlowe Choice where the Marlowe contract will receive oracle input.

Meaning that we can complete the parameters to calculate the address of the bridge validator for each oracle feed that we want to validate. Then, for each Marlowe contract that wants to make use of the bridge validator, a new UTxO at that address will need to be created, containing the role token and with a reference (contained in the datum) to the thread token that the Marlowe contract needs to have. Both tokens will have the same policyID and will be used to make a handshake between validators. (Only one instance of the bridge script can fill each Marlowe contract and only one Marlowe contract can use each instance of the bridge script)

The bridge validator will perform the following validations:
- The datum of the continuing output doesn’t change
- The value of the continuing output doesn’t change
- Exactly one oracle feed UTxO is included as a reference input
- Exactly one non-ada token is present at the bridge script UTxO. (It is assumed to be the role token)
- There is a Marlowe contract at the inputs (If there are multiple, the first one is used)
- The Marlowe contract has the corresponding thread token
- The Marlowe contract has a redeemer that resolves a choice action with the following format:
    - The choice name matches the Oracle feed name
    - The choice owner is a role token and matches the role token at the bridge UTxO
    - The choice value matches the oracle value

## Appendix
The following transactions demonstrate the different flows when using an oracle service with a Marlowe contract:

Example one:
https://preprod.cexplorer.io/tx/27c999650eae72dc12547a5896ffe1dbcb2dd5f9ec72178b6f7778c408d12e90
In this example, we can see a contract that requests input from an oracle, that reports the appropriate value by passing it as a redeemer of the Marlowe contract.

Example two:
https://cexplorer.io/tx/7c51f613cdf181fda2967847eb39b2d42a41eafa9f4e45c6869362590c575548 
This example showcases the more complex flow of using a decentralized oracle since it includes running another validation through the Oracle Bridge.

[^1]: https://github.com/Charli3-Official/oracle-datum-lib/blob/main/spec.cddl
[^2]: https://docs.orcfax.io/consume#read-cbor-datum-on-chain
[^3]: https://github.com/orcfax/datum-demo
[^4]: https://github.com/input-output-hk/marlowe-plutus/blob/main/marlowe-plutus/charli3.md
[^5]: https://cexplorer.io/datum/7ec270f971d03f084c1c198a4f99e53dc8519430dcf4123d65b9e1c48fedd82e
[^6]: https://cexplorer.io/datum/9e337356f507cd6c0c81f465a6b949b6a0007fc372784468a39dccabc739e1c2
