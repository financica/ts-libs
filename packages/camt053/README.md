# @ingram-tech/camt053

TypeScript parser for [ISO 20022](https://www.iso20022.org/) CAMT.053 (Bank-to-Customer Statement) XML documents. Parses CAMT.053.001.x (any version) into fully typed objects, extracting every data element from the standard.

## Installation

```bash
npm install @ingram-tech/camt053
```

## Usage

```typescript
import { parseCamt053 } from "@ingram-tech/camt053";

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

## Parsed fields

The parser extracts all CAMT.053 data elements:

- **Group header**: message ID, creation date, recipient
- **Statement**: ID, sequence numbers, date range, account, balances, entries
- **Account**: IBAN or other ID, currency, owner (name, address, org ID), servicer (name, BIC, address)
- **Balances**: type (OPBD, CLBD, CLAV, etc.), amount, currency, credit/debit indicator, date
- **Transaction summary**: total/credit/debit entry counts and sums, net amount
- **Entries**: reference, amount, currency, credit/debit, status, booking/value dates, bank transaction code, charges, reversal indicator, additional info
- **Amount details**: transaction amount, currency exchange (source/target/unit currency, exchange rate)
- **Entry details**: batch info, transaction details
- **Transaction details**: references (message/payment/instruction/end-to-end/transaction/mandate IDs), amount details, bank transaction code, related parties (debtor/creditor/ultimate), related agents, purpose, remittance info (unstructured and structured), charges, return info, additional info

## Supported versions

Supports all CAMT.053.001.x namespace versions (001 through 010+), including the v10 `Cdtr > Pty > Nm` nesting used by modern banks.

## Development

```bash
npm test          # run tests in watch mode
npm run test:run  # run tests once
npm run lint      # eslint
npm run format    # prettier
npm run build     # build to dist/
npm run ci        # type-check + lint + test + build
```

## License

MIT
