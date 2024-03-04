# MOS Known Feeds

The following table contains the information about all the feeds that the current implementation of the MOS supports. This means that we can configure via the [mos-config.json](../mos-config.json) any combination of these feeds. Thus, a particular instances of the MOS can resolve at most any of these feeds, but it's important to be aware that a MOS instance could be configure supporting less feeds.

<table align="center">
<tr><th> Source </th><th> Information </th><th> OnChain Validation </th></tr>
<tr><td>

`Coingecko`
</td><td>

|     Feed    |      Extra      |  Type   |
|:-----------:|:---------------:|:-------:|
|  `ADAUSD`   |  `100_000_000`  |  Price  |
|  `USDADA`   |  `100_000_000`  |  Price  |

</td><th style="text-align: center">
❌
</th></tr>
<tr><td>

`Charli3`
</td><td>

|     Feed    |      Extra      |  Type   |
|:-----------:|:---------------:|:-------:|
|  `ADAUSD`   |   `1_000_000`   |  Price  |

</td><th style="text-align: center">
✅
</th></tr>
<tr><td>

`Orcfax`
</td><td>

|     Feed    |      Extra      |  Type   |
|:-----------:|:---------------:|:-------:|
|  `ADAUSD`   |   `1_000_000`   |  Price  |
|  `USDADA`   |   `1_000_000`   |  Price  |

</td><th style="text-align: center">
✅
</th></tr>
</table>

#### How to read the table?

To safely use table information in a **Choice Action** within a Marlowe Contract, it's important to understand how to read the table information. When setting up a Marlowe Contract that requires oracle feed information, a **Choice** needs to be used. To make a **Choice**, three pieces of information are needed: the **Choice Owner**, the **Choice Name**, and a **Choose Between** range of allowed values to resolve the choice.

- The **Choice Owner** will be composed by the `Source` name followed by the word "Oracle".
- The **Choice Name** will be composed by the `Source` name followed by the `Feed` name.
- The **Choose Between** range consists of two integers that specify the valid range for the resolved integer value. It's **extremly important** to understand that because the choice only supports integers we need to have some kind "conversion" from a (most probably) decimal number to some integer. Here is when the `Extra` information comes to play, specifying the amount by which we need to divide the integer that is resolving the choice.

Lastly, another really relevant information in the table is the `OnChain Validation`, meaning the transaction resolving the choice will go along with the bridge validation ensuring the correctness of the provided feed.

##### Example

Let's suppose we want to use the Orcfax ADAUSD feed, then:

- **Choice Owner**: `Orcfax Oracle`
- **Choice Name**: `Orcfax ADAUSD`
- **Choose Between**: Here can be any two integers depending on the Marlowe Contract, but again it's important to understand what it means for real values. Suppose the ADA/USD exchange rate is `0.7752`, then the integer value provided to resolve the choice will be `775200`, that is the original value multiply by the `Extra` information. So, besides the Marlowe Contract business logic that will use this integer, we need to take into account this to setup correctly the choose between range.

A concrete example of this choice can be found [here](../tests/choice-info/orcfax.json)
