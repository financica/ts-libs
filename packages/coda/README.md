# @financica/coda

TypeScript parser for [CODA](https://www.febelfin.be/en/expertise/electronic-banking/standards) (Coded statement of account) bank files. CODA is the Belgian standard, maintained by Febelfin, for electronic bank-to-customer account statements.

Parses CODA v2.x files into fully typed objects. Returns `null` when the content is not a CODA file; throws `CodaParseError` when it is one but is broken.

## Installation

```bash
npm install @financica/coda
```

## Usage

```typescript
import { parseCoda } from "@financica/coda";
import { readFileSync } from "node:fs";

const content = readFileSync("statement.cod", "utf-8");
const file = parseCoda(content);

if (file) {
	for (const stmt of file.statements) {
		console.log(`Account: ${stmt.account.number} (${stmt.account.currency})`);
		console.log(`Holder: ${stmt.accountHolderName}`);
		console.log(`Old balance: ${stmt.oldBalance.amount}`);
		console.log(`New balance: ${stmt.newBalance?.amount}`);

		for (const m of stmt.movements) {
			console.log(
				`  ${m.amount > 0 ? "+" : ""}${m.amount} ${m.counterpartyName ?? ""}`,
			);
			console.log(`    ${m.communication}`);

			if (m.structuredCommunicationType === 101) {
				// Belgian structured payment reference (+++xxx/xxxx/xxxxx+++)
				const ref = m.communication;
				console.log(
					`    Ref: +++${ref.slice(0, 3)}/${ref.slice(3, 7)}/${ref.slice(7)}+++`,
				);
			}
		}

		for (const msg of stmt.freeCommunications) {
			console.log(`  Message: ${msg}`);
		}
	}
}
```

## Design

- `parseCoda(content)` returns a `CodaFile`, or `null` when the content has no CODA header record. A CODA file with a missing old-balance record or an invalid mandatory date, amount or transaction code throws `CodaParseError`.
- Balances and movements are signed numbers: positive for credit, negative for debit. There is no separate sign field to check.
- Fields are extracted at their standard-defined positions. Communications are concatenated across record parts (2.1 + 2.2 + 2.3 for movements, 3.1 + 3.2 + 3.3 for information records) and right-trimmed.
- Structured communications are not parsed further. The `communicationType` and `structuredCommunicationType` fields tell you the format; the `communication` field gives you the raw content. Type 101/102 Belgian structured references come through as 12-digit strings ready for mod-97 validation. Types such as 127 (SEPA direct debit) and 105 (FX details) are left as raw strings for the caller to parse.
- Each record 2.1 becomes a `CodaMovement`, with fields from 2.2 and 2.3 merged in. Information records (3.x) are attached as an `information[]` array on the preceding movement.

## Parsed fields

The parser extracts all fields defined in the CODA v2.8 standard:

- **Header (record 0)**: creation date, bank ID, duplicate flag, file reference, addressee name, BIC, company ID, separate application code, MT940 references, version
- **Old balance (record 1)**: account number (Belgian BBAN, foreign BBAN, Belgian IBAN, or foreign IBAN), currency, country code, paper/CODA statement sequence numbers, account holder name, account description, opening balance (signed amount + date)
- **Movements (records 2.1 / 2.2 / 2.3)**:
    - 2.1: sequence/detail numbers, bank reference, signed amount, value date, entry date, 8-digit transaction code (type/family/transaction/category), communication (structured or free), globalisation code
    - 2.2: customer reference, counterparty BIC, R-transaction type and reason, SEPA CategoryPurpose and Purpose codes
    - 2.3: counterparty account number and currency, counterparty name, communication continuation
- **Information (records 3.1 / 3.2 / 3.3)**: sequence/detail numbers, bank reference, transaction code, communication (structured or free), linked to parent movement
- **New balance (record 8)**: closing balance (signed amount + date)
- **Free communications (record 4)**: free-text messages, grouped by sequence number
- **Trailer (record 9)**: debit and credit movement totals

## API reference

### `parseCoda(content: string): CodaFile | null`

Parse a CODA file. Returns `null` if the input is empty or doesn't start with a CODA header record (record 0 with a DDMMYY creation date); throws `CodaParseError` if it does but a mandatory record or field is missing or invalid. Handles both `\n` and `\r\n` line endings. Multiple statements in a single file (delimited by record 0 boundaries) are supported.

### Types

#### `CodaFile`

| Field        | Type              | Description                 |
| ------------ | ----------------- | --------------------------- |
| `statements` | `CodaStatement[]` | One or more bank statements |

#### `CodaStatement`

| Field                    | Type             | Description                                 |
| ------------------------ | ---------------- | ------------------------------------------- |
| `creationDate`           | `Date`           | File creation date                          |
| `bankId`                 | `number`         | Bank identification number                  |
| `isDuplicate`            | `boolean`        | Whether this is a duplicate file            |
| `fileReference`          | `string?`        | File reference assigned by the bank         |
| `addressee`              | `string`         | Name of the addressee                       |
| `bic`                    | `string?`        | BIC of the bank holding the account         |
| `companyId`              | `string?`        | Belgian company identification number       |
| `separateApplication`    | `string`         | Separate application code (5 positions)     |
| `transactionReference`   | `string?`        | MT940 transaction reference (tag 20)        |
| `relatedReference`       | `string?`        | MT940 related reference (tag 21)            |
| `version`                | `number`         | CODA standard version                       |
| `account`                | `CodaAccount`    | Account details                             |
| `paperStatementSequence` | `number`         | Paper statement sequence number             |
| `codaStatementSequence`  | `number`         | CODA statement sequence number              |
| `accountHolderName`      | `string?`        | Name of the account holder                  |
| `accountDescription`     | `string?`        | Account description                         |
| `oldBalance`             | `CodaBalance`    | Opening balance                             |
| `newBalance`             | `CodaBalance?`   | Closing balance (absent in empty files)     |
| `movements`              | `CodaMovement[]` | Transaction movements                       |
| `freeCommunications`     | `string[]`       | Free communication texts                    |
| `totalDebit`             | `number`         | Sum of debit movement amounts from trailer  |
| `totalCredit`            | `number`         | Sum of credit movement amounts from trailer |

#### `CodaAccount`

| Field         | Type                                                                   | Description                          |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `structure`   | `"belgian-bban" \| "foreign-bban" \| "belgian-iban" \| "foreign-iban"` | Account number format                |
| `number`      | `string`                                                               | Account number (BBAN or IBAN)        |
| `currency`    | `string?`                                                              | ISO currency code                    |
| `countryCode` | `string?`                                                              | ISO country code (Belgian BBAN only) |

#### `CodaBalance`

| Field    | Type     | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| `amount` | `number` | Signed amount (positive = credit, negative = debit) |
| `date`   | `Date`   | Balance date                                        |

#### `CodaMovement`

| Field                         | Type                             | Description                         |
| ----------------------------- | -------------------------------- | ----------------------------------- |
| `sequenceNumber`              | `number`                         | Continuous sequence number          |
| `detailNumber`                | `number`                         | Detail number within sequence       |
| `bankReference`               | `string`                         | Bank reference (informative)        |
| `amount`                      | `number`                         | Signed amount                       |
| `valueDate`                   | `Date?`                          | Value date                          |
| `entryDate`                   | `Date`                           | Entry/booking date                  |
| `transactionCode`             | `CodaTransactionCode`            | 8-digit transaction code            |
| `communication`               | `string`                         | Full communication text             |
| `communicationType`           | `"structured" \| "unstructured"` | Communication format                |
| `structuredCommunicationType` | `number?`                        | 3-digit type (e.g. 101, 127)        |
| `paperStatementSequence`      | `number`                         | Paper statement sequence            |
| `globalisationCode`           | `number?`                        | Globalisation hierarchy level (1-9) |
| `customerReference`           | `string?`                        | Customer reference                  |
| `counterpartyBic`             | `string?`                        | Counterparty's bank BIC             |
| `rTransactionType`            | `number?`                        | R-transaction type (1-5)            |
| `rTransactionReason`          | `string?`                        | ISO reason return code              |
| `categoryPurpose`             | `string?`                        | SEPA CategoryPurpose                |
| `purpose`                     | `string?`                        | SEPA Purpose                        |
| `counterpartyAccountNumber`   | `string?`                        | Counterparty account number         |
| `counterpartyAccountCurrency` | `string?`                        | Counterparty account currency       |
| `counterpartyName`            | `string?`                        | Counterparty name                   |
| `information`                 | `CodaInformation[]`              | Linked information records          |

#### `CodaTransactionCode`

| Field         | Type     | Description                                                                       |
| ------------- | -------- | --------------------------------------------------------------------------------- |
| `type`        | `number` | Type (0=simple, 1=customer total, 2=bank total, 5/6/7/8/9=details, 3=with detail) |
| `family`      | `number` | Family (01-39 domestic/SEPA, 41-79 foreign, 80-89 other)                          |
| `transaction` | `number` | Transaction within family                                                         |
| `category`    | `number` | Category (000=net amount, others for cost breakdowns)                             |

#### `CodaInformation`

| Field                         | Type                             | Description             |
| ----------------------------- | -------------------------------- | ----------------------- |
| `sequenceNumber`              | `number`                         | Matches parent movement |
| `detailNumber`                | `number`                         | Detail number           |
| `bankReference`               | `string`                         | Bank reference          |
| `transactionCode`             | `CodaTransactionCode`            | Transaction code        |
| `communication`               | `string`                         | Full communication text |
| `communicationType`           | `"structured" \| "unstructured"` | Communication format    |
| `structuredCommunicationType` | `number?`                        | 3-digit type code       |

## Development

Standard scripts — see the [repository README](../../README.md#getting-started).

## License

MIT
