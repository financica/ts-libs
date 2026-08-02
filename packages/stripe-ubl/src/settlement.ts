import { centsToDecimal } from "@financica/ubl/build";
import type Stripe from "stripe";
import { toNumber } from "./utils";

/**
 * Gross amount (in cents) of an invoice that has already been settled, for
 * BT-113.
 *
 * Deliberately `amount_paid` rather than `total - amount_due`: Stripe also
 * reduces `amount_due` by `pre_payment_credit_notes_amount` and
 * `post_payment_credit_notes_amount`, and a credit-note reduction is not a
 * prepayment. Folding those in would overstate BT-113 and understate what the
 * document still asks for — the credit note travels as its own Peppol document
 * and the receiver nets the two via BT-25.
 */
export const resolveInvoiceSettledCents = (invoice: Stripe.Invoice): number =>
	Math.max(0, toNumber(invoice.amount_paid));

/**
 * Gross amount (in cents) of a credit note that has already been settled back
 * to the buyer, for BT-113.
 *
 * `post_payment_amount` is the part that "was refunded to the customer,
 * credited to the customer's balance, credited outside of Stripe, or any
 * combination thereof" — money that has already moved. Stripe guarantees
 * refunds + balance credits + out-of-band credits sum to it, so this is one
 * field rather than a three-way reconciliation.
 *
 * `pre_payment_amount` is excluded, and that is load-bearing rather than a
 * judgement call. It only reduced the open invoice's `amount_remaining`;
 * nothing was returned to the buyer. The parent invoice still travels over
 * Peppol at its full amount, so the receiver nets the two documents via BT-25:
 * invoice 121 against credit note 121 leaves 0 owed. Emitting BT-113 on that
 * credit note would make it payable 0, the netting would come out as
 * `121 - 0`, and the buyer would still owe the full amount despite the credit.
 * A credit note's BT-113 therefore means strictly "we have already paid this
 * back to you", never "this has been netted off elsewhere".
 *
 * The coarse `credit_note.type` is deliberately not used as a fallback. Both
 * the amount split and `type`'s `mixed` value arrived in the same Stripe API
 * version (`2025-05-28.basil`, stripe-node 18.2.0), so on any version old
 * enough to lack the amounts a genuinely mixed credit note reports as plain
 * `pre_payment`/`post_payment`. Reading that as fully settled would emit BT-113
 * for the whole total and understate what is still outstanding — the buyer
 * would never net the pre-payment portion against the open invoice. The peer
 * range requires `stripe >=22`, so the split is always available; if the field
 * is somehow absent, `toNumber` yields 0 and no BT-113 is asserted.
 */
export const resolveCreditNoteSettledCents = (creditNote: Stripe.CreditNote): number =>
	Math.max(0, toNumber(creditNote.post_payment_amount));

export interface ResolvePrepaidAmountParams {
	/** Gross cents already settled (see the resolvers above). */
	settledCents: number;
	/** Stripe's own gross document total, in cents. */
	grossCents: number;
	/** BT-112 as *derived* by `buildTaxTotals` from the reconciled lines. */
	taxInclusiveAmount: number;
}

/**
 * Resolve BT-113 for `buildTaxTotals`, or `undefined` when nothing is settled.
 *
 * A fully-settled document snaps to the **derived** `taxInclusiveAmount` rather
 * than Stripe's gross total. The two can differ by a cent: BT-112 is rebuilt
 * from the reconciled lines with each VAT category's tax derived as
 * `taxable × rate` (BR-CO-17), not summed from Stripe's tax cents. Passing
 * Stripe's figure would leave a settled document reporting a payable amount of
 * ±0.01 instead of exactly 0 — and a positive 0.01 re-triggers BR-CO-25's
 * demand for a due date, which is the whole thing being fixed.
 *
 * Snapping means a genuine overpayment (`settledCents > grossCents`) reports 0
 * rather than a negative payable amount. Stripe does not let an invoice be
 * overpaid, so in practice this branch only absorbs the rounding case.
 */
export const resolvePrepaidAmount = (
	params: ResolvePrepaidAmountParams,
): number | undefined => {
	const { settledCents, grossCents, taxInclusiveAmount } = params;
	if (settledCents <= 0) return undefined;
	if (grossCents > 0 && settledCents >= grossCents) return taxInclusiveAmount;
	return centsToDecimal(settledCents);
};
