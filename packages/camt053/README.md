# @financica/camt053

TypeScript parser for [ISO 20022](https://www.iso20022.org/) CAMT.053 (Bank-to-Customer Statement) XML. Handles namespace versions 001 through 010, including the `Cdtr > Pty > Nm` nesting introduced in v10, and returns typed objects.

## Installation

```bash
npm install @financica/camt053
```

## Usage

```typescript
import { parseCamt053 } from "@financica/camt053";

const xml = fs.readFileSync("statement.xml", "utf8");
const report = parseCamt053(xml);

if (report) {
	console.log(report.messageId);
	for (const stmt of report.statements) {
		console.log(`Account: ${stmt.account.iban}`);
		console.log(`Owner: ${stmt.account.owner?.name}`);
		console.log(`Bank: ${stmt.account.servicer?.name}`);

		for (const balance of stmt.balances) {
			console.log(`${balance.type}: ${balance.amount} ${balance.currency}`);
		}

		for (const entry of stmt.entries) {
			console.log(
				`${entry.creditDebitIndicator} ${entry.amount} ${entry.currency}`,
			);
			console.log(`  Status: ${entry.status}`);
			console.log(`  Info: ${entry.additionalInformation}`);

			if (entry.amountDetails?.currencyExchange) {
				const fx = entry.amountDetails.currencyExchange;
				console.log(
					`  FX: ${fx.sourceCurrency}/${fx.targetCurrency} @ ${fx.exchangeRate}`,
				);
			}
		}
	}
}
```

## Detecting the format

`CAMT053_NS_PREFIX` is the namespace prefix every CAMT.053 version shares, so a
caller can sniff a file before parsing it:

```ts
import { CAMT053_NS_PREFIX } from "@financica/camt053";

const looksLikeCamt053 = (content: string) => content.includes(CAMT053_NS_PREFIX);
```

## Parsed fields

Extracted:

- **Group header**: message ID, creation date, recipient
- **Statement**: ID, sequence numbers, date range, account, balances, entries
- **Account**: IBAN or other ID, currency, owner (name, address, org ID), servicer (name, BIC, address)
- **Balances**: type (OPBD, CLBD, CLAV, etc.), amount, currency, credit/debit indicator, date
- **Transaction summary**: total/credit/debit entry counts and sums, net amount
- **Entries**: reference, amount, currency, credit/debit, status, booking/value dates, bank transaction code, charges, reversal indicator, additional info
- **Amount details**: transaction amount, currency exchange (source/target/unit currency, exchange rate)
- **Entry details**: batch info, transaction details
- **Transaction details**: references (message/payment/instruction/end-to-end/transaction/mandate IDs), amount details, bank transaction code, related parties (debtor/creditor/ultimate), related agents, purpose, remittance info (unstructured and structured), charges, return info, additional info

## Development

Standard scripts — see the [repository README](../../README.md#getting-started).

## License

MIT
