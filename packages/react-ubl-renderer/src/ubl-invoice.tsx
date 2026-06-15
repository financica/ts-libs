import {
	parseUblInvoice,
	type UblAddress,
	type UblInvoice as UblInvoiceData,
	type UblLine,
	type UblParty,
	type UblPaymentMeans,
	type UblTaxSubtotal,
} from "@financica/ubl";
import { Fragment, useMemo } from "react";
import {
	finite,
	formatDate,
	formatMoney,
	formatPercent,
	isFiniteNumber,
} from "./format";

export type UblInvoiceProps = {
	/** Locale for currency formatting. Defaults to `en-US`. */
	locale?: string;
	/** Extra class names appended to the `.ubl-invoice` root. */
	className?: string;
	/** Rendered when `xml` is provided but cannot be parsed. Defaults to `null`. */
	fallback?: React.ReactNode;
} & (
	| {
			/** Raw UBL / Peppol invoice XML. Parsed internally. */
			xml: string;
			invoice?: never;
	  }
	| {
			/** Pre-parsed UBL invoice, e.g. from `parseUblInvoice`. */
			invoice: UblInvoiceData;
			xml?: never;
	  }
);

const TAX_CATEGORY_LABELS: Record<string, string> = {
	S: "Standard rate",
	Z: "Zero rated",
	E: "Exempt",
	AE: "Reverse charge",
	K: "Intra-community",
	G: "Export",
	O: "Outside scope",
	L: "IGIC",
	M: "IPSI",
};

const addressLines = (address: UblAddress | undefined): string[] => {
	if (!address) return [];
	const locality = [address.postalZone, address.city, address.countrySubentity]
		.filter((part): part is string => !!part && part.trim().length > 0)
		.join(" ");
	return [
		address.street,
		address.additionalStreet,
		locality,
		address.countryCode,
	].filter((line): line is string => !!line && line.trim().length > 0);
};

const PartyField: React.FC<{ label: string; value: string | null | undefined }> = ({
	label,
	value,
}) =>
	value ? (
		<div className="ubl-party-row">
			<dt>{label}</dt>
			<dd>{value}</dd>
		</div>
	) : null;

const Party: React.FC<{ party: UblParty }> = ({ party }) => {
	const displayName =
		party.name?.trim() || party.registrationName?.trim() || "Unknown";
	const endpoint = party.endpointId
		? party.endpointSchemeId
			? `${party.endpointSchemeId}:${party.endpointId}`
			: party.endpointId
		: null;
	const lines = addressLines(party.address);
	const registration =
		party.registrationName && party.registrationName.trim() !== displayName
			? party.registrationName
			: null;

	return (
		<>
			<div className="ubl-party-name">{displayName}</div>
			{lines.length > 0 ? (
				<div className="ubl-party-address">
					{lines.map((line, index) => (
						<Fragment key={index}>
							{index > 0 ? <br /> : null}
							{line}
						</Fragment>
					))}
				</div>
			) : (
				<div className="ubl-party-address ubl-party-empty">
					No billing address found.
				</div>
			)}
			<dl className="ubl-party-fields">
				<PartyField label="VAT ID" value={party.vatId} />
				<PartyField label="Tax ID" value={party.companyId} />
				<PartyField label="Endpoint" value={endpoint} />
				<PartyField label="Registration" value={registration} />
				<PartyField label="Legal form" value={party.companyLegalForm} />
				<PartyField label="Contact" value={party.contact?.name} />
				<PartyField label="Email" value={party.contact?.email} />
				<PartyField label="Phone" value={party.contact?.phone} />
			</dl>
		</>
	);
};

const LineRow: React.FC<{
	line: UblLine;
	index: number;
	currency: string;
	locale: string;
}> = ({ line, index, currency, locale }) => {
	const name = line.itemName?.trim() || line.description?.trim() || "Line item";
	const secondary =
		line.description?.trim() && line.description.trim() !== name
			? line.description.trim()
			: null;
	return (
		<tr>
			<td>{index + 1}</td>
			<td>
				{name}
				{secondary ? (
					<>
						<br />
						<small className="ubl-muted">{secondary}</small>
					</>
				) : null}
			</td>
			<td className="ubl-num">
				{finite(line.quantity)}
				{line.unitCode ? (
					<small className="ubl-muted"> {line.unitCode}</small>
				) : null}
			</td>
			<td className="ubl-num">
				{formatMoney(currency, finite(line.unitPrice), locale)}
			</td>
			<td className="ubl-num">
				{formatMoney(currency, finite(line.taxAmount), locale)}
				{isFiniteNumber(line.taxPercent) ? (
					<>
						<br />
						<small className="ubl-muted">
							{formatPercent(line.taxPercent)}
						</small>
					</>
				) : null}
			</td>
			<td className="ubl-num">
				{formatMoney(currency, finite(line.discountAmount), locale)}
			</td>
			<td className="ubl-num">
				{formatMoney(currency, finite(line.lineExtensionAmount), locale)}
			</td>
		</tr>
	);
};

const TaxBreakdownRow: React.FC<{
	subtotal: UblTaxSubtotal;
	currency: string;
	locale: string;
}> = ({ subtotal, currency, locale }) => {
	const rateLabel = isFiniteNumber(subtotal.taxPercent)
		? formatPercent(subtotal.taxPercent)
		: null;
	const categoryLabel =
		(subtotal.taxCategoryId ? TAX_CATEGORY_LABELS[subtotal.taxCategoryId] : null) ||
		subtotal.taxCategoryId ||
		"VAT";
	const label = rateLabel ? `${categoryLabel} (${rateLabel})` : categoryLabel;
	return (
		<div className="ubl-totals-row">
			<span className="ubl-tax-label">
				{label}
				{subtotal.taxExemptionReason ? (
					<span className="ubl-exemption-note">
						{subtotal.taxExemptionReason}
					</span>
				) : null}
				<br />
				<small className="ubl-muted">
					on {formatMoney(currency, finite(subtotal.taxableAmount), locale)}
				</small>
			</span>
			<span>{formatMoney(currency, finite(subtotal.taxAmount), locale)}</span>
		</div>
	);
};

const PaymentSection: React.FC<{
	paymentMeans: UblPaymentMeans[];
}> = ({ paymentMeans }) => {
	const meaningful = paymentMeans.filter(
		(means) => means.iban || means.bic || means.accountName || means.paymentId,
	);
	if (meaningful.length === 0) return null;
	return (
		<section className="ubl-payment">
			<h2 className="ubl-section-label">Payment information</h2>
			<div className="ubl-pm-grid">
				{meaningful.map((means, index) => (
					<div className="ubl-pm-entry" key={index}>
						{means.accountName ? (
							<div className="ubl-pm-name">{means.accountName}</div>
						) : null}
						{means.iban ? (
							<div className="ubl-pm-row">
								<span>IBAN</span>
								<code>{means.iban}</code>
							</div>
						) : null}
						{means.bic ? (
							<div className="ubl-pm-row">
								<span>BIC</span>
								<code>{means.bic}</code>
							</div>
						) : null}
						{means.paymentId ? (
							<div className="ubl-pm-row">
								<span>Reference</span>
								<code>{means.paymentId}</code>
							</div>
						) : null}
					</div>
				))}
			</div>
		</section>
	);
};

/**
 * Render a UBL / Peppol BIS Billing 3.0 invoice as a human-readable document.
 * Pass raw `xml` (parsed internally) or a pre-parsed `invoice` object. All text
 * is React-escaped; the markup is scoped under the `.ubl-invoice` class (import
 * the package stylesheet to style it).
 */
export const UblInvoice: React.FC<UblInvoiceProps> = (props) => {
	const { locale = "en-US", className } = props;
	const xml = "xml" in props ? props.xml : undefined;
	const provided = "invoice" in props ? props.invoice : undefined;
	const invoice = useMemo(
		() => (xml !== undefined ? parseUblInvoice(xml) : (provided ?? null)),
		[xml, provided],
	);

	if (!invoice) return <>{props.fallback ?? null}</>;

	const currency = invoice.currency || "EUR";
	const money = (value: number) => formatMoney(currency, value, locale);
	const isCreditNote = invoice.documentType === "CreditNote";
	const documentLabel = isCreditNote ? "Credit Note" : "Invoice";
	const documentNumber = invoice.id || "-";

	const total = finite(invoice.monetaryTotal.taxInclusiveAmount);
	const subtotal = finite(invoice.monetaryTotal.lineExtensionAmount);
	const chargeTotal = invoice.monetaryTotal.chargeTotalAmount ?? 0;
	const allowanceTotal = invoice.monetaryTotal.allowanceTotalAmount ?? 0;
	const prepaid = invoice.monetaryTotal.prepaidAmount ?? 0;
	const rounding = invoice.monetaryTotal.payableRoundingAmount ?? 0;
	const payable = isFiniteNumber(invoice.monetaryTotal.payableAmount)
		? invoice.monetaryTotal.payableAmount
		: total;
	const taxTotal = invoice.taxSubtotals.reduce(
		(sum, entry) => sum + finite(entry.taxAmount),
		0,
	);
	const showPayable = Math.abs(payable - total) > 0.005;
	const hasTaxBreakdown = invoice.taxSubtotals.length > 0;

	const paymentMeansList =
		invoice.paymentMeansList ??
		(invoice.paymentMeans ? [invoice.paymentMeans] : []);
	const billingReference = invoice.billingReference;
	const period = invoice.invoicePeriod;
	const periodLabel =
		period?.startDate || period?.endDate
			? `${formatDate(period?.startDate)} – ${formatDate(period?.endDate)}`
			: null;

	return (
		<article className={className ? `ubl-invoice ${className}` : "ubl-invoice"}>
			<header className="ubl-header">
				<div>
					<h1>
						{documentLabel} {documentNumber}
					</h1>
					<span className="ubl-badge">{documentLabel}</span>
				</div>
				<div className="ubl-meta">
					<div>
						<span>Issue date:</span>{" "}
						<strong>{formatDate(invoice.issueDate)}</strong>
					</div>
					<div>
						<span>Due date:</span>{" "}
						<strong>{formatDate(invoice.dueDate)}</strong>
					</div>
					<div>
						<span>Currency:</span> <strong>{currency}</strong>
					</div>
					<div>
						<span>Total:</span> <strong>{money(total)}</strong>
					</div>
					{invoice.buyerReference ? (
						<div>
							<span>Reference:</span>{" "}
							<strong>{invoice.buyerReference}</strong>
						</div>
					) : null}
					{invoice.orderReference ? (
						<div>
							<span>Order ref:</span>{" "}
							<strong>{invoice.orderReference}</strong>
						</div>
					) : null}
					{periodLabel ? (
						<div className="ubl-full">
							<span>Period:</span> <strong>{periodLabel}</strong>
						</div>
					) : null}
					{invoice.paymentTermsNote ? (
						<div className="ubl-full">
							<span>Payment terms:</span>{" "}
							<strong>{invoice.paymentTermsNote}</strong>
						</div>
					) : null}
				</div>
			</header>

			{isCreditNote && billingReference?.invoiceId ? (
				<p className="ubl-reference">
					References invoice <strong>{billingReference.invoiceId}</strong>
					{billingReference.invoiceIssueDate
						? ` issued on ${formatDate(billingReference.invoiceIssueDate)}`
						: ""}
					.
				</p>
			) : null}

			<section className="ubl-parties">
				<div className="ubl-box">
					<h2>Supplier billing details</h2>
					<Party party={invoice.seller} />
				</div>
				<div className="ubl-box">
					<h2>Receiver billing details</h2>
					<Party party={invoice.buyer} />
				</div>
			</section>

			<section>
				<table>
					<thead>
						<tr>
							<th>#</th>
							<th>Description</th>
							<th className="ubl-num">Qty</th>
							<th className="ubl-num">Unit</th>
							<th className="ubl-num">Tax</th>
							<th className="ubl-num">Discount</th>
							<th className="ubl-num">Amount</th>
						</tr>
					</thead>
					<tbody>
						{invoice.lines.length > 0 ? (
							invoice.lines.map((line, index) => (
								<LineRow
									key={line.id || index}
									line={line}
									index={index}
									currency={currency}
									locale={locale}
								/>
							))
						) : (
							<tr>
								<td colSpan={7}>No line items.</td>
							</tr>
						)}
					</tbody>
				</table>
			</section>

			<section className="ubl-totals">
				<div className="ubl-totals-row">
					<span>Subtotal</span>
					<span>{money(subtotal)}</span>
				</div>
				{chargeTotal > 0 ? (
					<div className="ubl-totals-row">
						<span>Charges</span>
						<span>{money(chargeTotal)}</span>
					</div>
				) : null}
				{allowanceTotal > 0 ? (
					<div className="ubl-totals-row">
						<span>Discount</span>
						<span>−{money(allowanceTotal)}</span>
					</div>
				) : null}
				{hasTaxBreakdown ? (
					<>
						<hr className="ubl-totals-divider" />
						{invoice.taxSubtotals.map((subtotalEntry, index) => (
							<TaxBreakdownRow
								key={index}
								subtotal={subtotalEntry}
								currency={currency}
								locale={locale}
							/>
						))}
						<hr className="ubl-totals-divider" />
					</>
				) : (
					<div className="ubl-totals-row">
						<span>VAT</span>
						<span>{money(taxTotal)}</span>
					</div>
				)}
				<div className="ubl-totals-row">
					<strong>Total</strong>
					<strong>{money(total)}</strong>
				</div>
				{rounding !== 0 ? (
					<div className="ubl-totals-row">
						<span>Rounding</span>
						<span>{money(rounding)}</span>
					</div>
				) : null}
				{prepaid > 0 ? (
					<div className="ubl-totals-row">
						<span>Amount paid</span>
						<span>−{money(prepaid)}</span>
					</div>
				) : null}
				{showPayable ? (
					<div className="ubl-totals-row">
						<strong>Amount due</strong>
						<strong>{money(payable)}</strong>
					</div>
				) : null}
			</section>

			<PaymentSection paymentMeans={paymentMeansList} />

			{invoice.note ? (
				<section className="ubl-note">{invoice.note}</section>
			) : null}
		</article>
	);
};
