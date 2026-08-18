import { PDFDocument, type PDFFont, type PDFPage, rgb } from "@cantoo/pdf-lib";
// fontkit's ESM build has no default export, only named ones; the namespace is
// what `registerFontkit` wants (it calls `.create`).
import * as fontkit from "fontkit";
import { buildFacturXXml } from "../generate/index.js";
import type { FacturXInvoice, TradeParty } from "../model.js";
import { type FacturXProfile, detectProfile } from "../profiles.js";
import { attachFacturXXml } from "../pdf/index.js";
import { formatDecimal } from "../numeric.js";
import { FONT_BOLD_BASE64, FONT_REGULAR_BASE64 } from "./fonts.js";
import { type RenderLabels, labelsForLocale } from "./i18n.js";

/**
 * Built-in visual template: renders a `FacturXInvoice` to a clean A4 PDF
 * with fully embedded fonts, ready for `attachFacturXXml` to turn into a
 * PDF/A-3B hybrid. `generateFacturXPdf` composes the two steps.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_ZONE = 60;

const INK = rgb(0.07, 0.08, 0.1);
const MUTED = rgb(0.42, 0.44, 0.48);
const RULE = rgb(0.85, 0.86, 0.88);

const decodeBase64 = (base64: string): Uint8Array =>
	Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

interface Fonts {
	regular: PDFFont;
	bold: PDFFont;
}

const wrapText = (
	text: string,
	font: PDFFont,
	size: number,
	maxWidth: number,
): string[] => {
	const lines: string[] = [];
	for (const paragraph of text.split(/\r?\n/)) {
		const words = paragraph.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			lines.push("");
			continue;
		}
		let current = "";
		for (const word of words) {
			const candidate = current ? `${current} ${word}` : word;
			if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
				current = candidate;
			} else {
				lines.push(current);
				current = word;
			}
		}
		if (current) lines.push(current);
	}
	return lines;
};

/** Strip characters the embedded font subset cannot draw. */
const drawable = (font: PDFFont, text: string): string => {
	let result = "";
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		if (code === 0x0a || code === 0x0d) {
			result += char;
			continue;
		}
		try {
			font.widthOfTextAtSize(char, 10);
			result += char;
		} catch {
			result += "?";
		}
	}
	return result;
};

const partyAddressLines = (party: TradeParty, labels: RenderLabels): string[] => {
	const lines: string[] = [];
	const address = party.address;
	if (address?.line1) lines.push(address.line1);
	if (address?.line2) lines.push(address.line2);
	if (address?.line3) lines.push(address.line3);
	const cityLine = [address?.postcode, address?.city].filter(Boolean).join(" ");
	const withCountry = [cityLine || null, address?.country].filter(Boolean).join(", ");
	if (withCountry) lines.push(withCountry);
	if (party.vatId) lines.push(`${labels.vatId} ${party.vatId}`);
	else if (party.taxId) lines.push(`${labels.taxId} ${party.taxId}`);
	return lines;
};

export interface RenderInvoicePdfOptions {
	/** Template language: "en", "fr", "de" or "nl" (region suffixes accepted). */
	locale?: string;
}

/**
 * Render the invoice with the built-in template. Returns the open
 * `PDFDocument` so the caller can post-process before saving; most callers
 * want `generateFacturXPdf` instead.
 */
export const renderInvoicePdf = async (
	invoice: FacturXInvoice,
	options: RenderInvoicePdfOptions = {},
): Promise<PDFDocument> => {
	const labels = labelsForLocale(options.locale);
	const pdfDoc = await PDFDocument.create();
	pdfDoc.registerFontkit(fontkit);
	const fonts: Fonts = {
		regular: await pdfDoc.embedFont(decodeBase64(FONT_REGULAR_BASE64), {
			subset: true,
		}),
		bold: await pdfDoc.embedFont(decodeBase64(FONT_BOLD_BASE64), { subset: true }),
	};

	const currencyFormatter = (() => {
		try {
			return new Intl.NumberFormat(options.locale ?? "en", {
				style: "currency",
				currency: invoice.currency,
			});
		} catch {
			return null;
		}
	})();
	const money = (value: number): string =>
		currencyFormatter
			? // Narrow/thin no-break spaces (French grouping) are not in the
				// embedded subset; regular NBSP is.
				currencyFormatter.format(value).replace(/[\u202f\u2009]/g, "\u00a0")
			: `${value.toFixed(2)} ${invoice.currency}`;

	let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
	let y = PAGE_HEIGHT - MARGIN;

	const newPage = () => {
		page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		y = PAGE_HEIGHT - MARGIN;
	};
	const ensure = (height: number) => {
		if (y - height < MARGIN + FOOTER_ZONE) newPage();
	};
	const draw = (
		text: string,
		x: number,
		options_: {
			font?: PDFFont;
			size?: number;
			color?: ReturnType<typeof rgb>;
			rightAlignAt?: number;
		} = {},
	) => {
		const font = options_.font ?? fonts.regular;
		const size = options_.size ?? 9;
		const safe = drawable(font, text);
		const x0 =
			options_.rightAlignAt !== undefined
				? options_.rightAlignAt - font.widthOfTextAtSize(safe, size)
				: x;
		page.drawText(safe, {
			x: x0,
			y,
			font,
			size,
			color: options_.color ?? INK,
		});
	};
	const rule = (x0: number, x1: number) => {
		page.drawLine({
			start: { x: x0, y: y + 3 },
			end: { x: x1, y: y + 3 },
			thickness: 0.7,
			color: RULE,
		});
	};

	// ---- Header: seller identity (left) and document title (right).
	const isCreditNote = invoice.typeCode === "381" || invoice.typeCode === "261";
	const title = isCreditNote ? labels.creditNote : labels.invoice;
	draw(invoice.seller.name ?? "", MARGIN, { font: fonts.bold, size: 14 });
	draw(title, MARGIN, {
		font: fonts.bold,
		size: 18,
		rightAlignAt: PAGE_WIDTH - MARGIN,
	});
	y -= 16;
	const sellerLines = partyAddressLines(invoice.seller, labels);
	draw(invoice.id, MARGIN, {
		size: 11,
		color: MUTED,
		rightAlignAt: PAGE_WIDTH - MARGIN,
	});
	for (const line of sellerLines) {
		draw(line, MARGIN, { size: 8.5, color: MUTED });
		y -= 11;
	}

	// ---- Meta (left) and buyer block (right).
	y -= 20;
	const metaTop = y;
	const metaPairs: [string, string][] = [
		[labels.issueDate, invoice.issueDate],
		...(invoice.paymentTerms?.dueDate
			? ([[labels.dueDate, invoice.paymentTerms.dueDate]] as [string, string][])
			: []),
		...(invoice.deliveryDate
			? ([[labels.deliveryDate, invoice.deliveryDate]] as [string, string][])
			: []),
		...(invoice.billingPeriod?.start || invoice.billingPeriod?.end
			? ([
					[
						labels.billingPeriod,
						`${invoice.billingPeriod.start ?? ""} — ${invoice.billingPeriod.end ?? ""}`,
					],
				] as [string, string][])
			: []),
		...(invoice.buyerReference
			? ([[labels.buyerReference, invoice.buyerReference]] as [string, string][])
			: []),
		...(invoice.purchaseOrderReference
			? ([[labels.purchaseOrder, invoice.purchaseOrderReference]] as [
					string,
					string,
				][])
			: []),
		...(invoice.contractReference
			? ([[labels.contractReference, invoice.contractReference]] as [
					string,
					string,
				][])
			: []),
		...(invoice.precedingInvoices ?? []).map((reference): [string, string] => [
			labels.precedingInvoice,
			reference.id,
		]),
	];
	for (const [label, value] of metaPairs) {
		draw(label, MARGIN, { size: 8.5, color: MUTED });
		draw(value, MARGIN + 110, { size: 9 });
		y -= 13;
	}
	const metaBottom = y;

	// Buyer block on the right, aligned with the meta rows.
	y = metaTop;
	const buyerX = PAGE_WIDTH - MARGIN - 220;
	draw(labels.billedTo, buyerX, { size: 8.5, color: MUTED });
	y -= 13;
	draw(invoice.buyer.name ?? "", buyerX, { font: fonts.bold, size: 10 });
	y -= 13;
	for (const line of partyAddressLines(invoice.buyer, labels)) {
		draw(line, buyerX, { size: 9 });
		y -= 12;
	}
	y = Math.min(metaBottom, y) - 24;

	// ---- Line table.
	const columns = {
		description: { x: MARGIN, width: 240 },
		quantity: { right: MARGIN + 300 },
		unitPrice: { right: MARGIN + 384 },
		vat: { right: MARGIN + 428 },
		amount: { right: PAGE_WIDTH - MARGIN },
	};
	const drawTableHeader = () => {
		draw(labels.description, columns.description.x, {
			font: fonts.bold,
			size: 8.5,
			color: MUTED,
		});
		draw(labels.quantity, 0, {
			font: fonts.bold,
			size: 8.5,
			color: MUTED,
			rightAlignAt: columns.quantity.right,
		});
		draw(labels.unitPrice, 0, {
			font: fonts.bold,
			size: 8.5,
			color: MUTED,
			rightAlignAt: columns.unitPrice.right,
		});
		draw(labels.vat, 0, {
			font: fonts.bold,
			size: 8.5,
			color: MUTED,
			rightAlignAt: columns.vat.right,
		});
		draw(labels.amount, 0, {
			font: fonts.bold,
			size: 8.5,
			color: MUTED,
			rightAlignAt: columns.amount.right,
		});
		y -= 6;
		rule(MARGIN, PAGE_WIDTH - MARGIN);
		y -= 12;
	};
	if (invoice.lines?.length) {
		ensure(60);
		drawTableHeader();
		for (const line of invoice.lines) {
			const nameLines = wrapText(
				drawable(fonts.regular, line.product.name),
				fonts.regular,
				9,
				columns.description.width,
			);
			const descriptionLines = line.product.description
				? wrapText(
						drawable(fonts.regular, line.product.description),
						fonts.regular,
						8,
						columns.description.width,
					)
				: [];
			const rowHeight = nameLines.length * 11 + descriptionLines.length * 10 + 7;
			if (y - rowHeight < MARGIN + FOOTER_ZONE) {
				newPage();
				drawTableHeader();
			}
			const rowTop = y;
			for (const [index, text] of nameLines.entries()) {
				draw(text, columns.description.x, { size: 9 });
				if (index < nameLines.length - 1) y -= 11;
			}
			const unitPrice = line.netPrice?.amount;
			y = rowTop;
			draw(formatDecimal(line.quantity), 0, {
				size: 9,
				rightAlignAt: columns.quantity.right,
			});
			if (unitPrice !== undefined) {
				draw(money(unitPrice), 0, {
					size: 9,
					rightAlignAt: columns.unitPrice.right,
				});
			}
			draw(
				line.tax.rateApplicablePercent !== undefined
					? `${formatDecimal(line.tax.rateApplicablePercent)}%`
					: line.tax.categoryCode,
				0,
				{ size: 9, rightAlignAt: columns.vat.right },
			);
			if (line.netTotal !== undefined) {
				draw(money(line.netTotal), 0, {
					size: 9,
					rightAlignAt: columns.amount.right,
				});
			}
			y = rowTop - (nameLines.length - 1) * 11 - 11;
			for (const text of descriptionLines) {
				draw(text, columns.description.x, { size: 8, color: MUTED });
				y -= 10;
			}
			y -= 4;
		}
		rule(MARGIN, PAGE_WIDTH - MARGIN);
		y -= 10;
	}

	// ---- Totals block, right-aligned.
	const totals = invoice.totals ?? {};
	const totalsRows: { label: string; value: string; bold?: boolean }[] = [];
	if (
		totals.lineTotal !== undefined &&
		(totals.allowanceTotal !== undefined || totals.chargeTotal !== undefined)
	) {
		totalsRows.push({ label: labels.lineTotal, value: money(totals.lineTotal) });
		if (totals.allowanceTotal !== undefined && totals.allowanceTotal !== 0) {
			totalsRows.push({
				label: labels.allowances,
				value: money(-totals.allowanceTotal),
			});
		}
		if (totals.chargeTotal !== undefined && totals.chargeTotal !== 0) {
			totalsRows.push({
				label: labels.charges,
				value: money(totals.chargeTotal),
			});
		}
	}
	if (totals.taxBasisTotal !== undefined) {
		totalsRows.push({
			label: labels.totalExclVat,
			value: money(totals.taxBasisTotal),
		});
	}
	for (const entry of invoice.taxBreakdown ?? []) {
		const isReverseCharge = entry.categoryCode === "AE";
		const label =
			entry.rateApplicablePercent !== undefined && entry.rateApplicablePercent > 0
				? labels.vatLine.replace(
						"{rate}",
						formatDecimal(entry.rateApplicablePercent),
					)
				: isReverseCharge
					? labels.reverseCharge
					: (entry.exemptionReason ?? labels.vatLine.replace("{rate}", "0"));
		totalsRows.push({ label, value: money(entry.calculatedAmount) });
	}
	if (totals.roundingAmount !== undefined && totals.roundingAmount !== 0) {
		totalsRows.push({
			label: labels.rounding,
			value: money(totals.roundingAmount),
		});
	}
	if (totals.grandTotal !== undefined) {
		totalsRows.push({
			label: labels.totalInclVat,
			value: money(totals.grandTotal),
			bold: true,
		});
	}
	if (totals.prepaidAmount !== undefined && totals.prepaidAmount !== 0) {
		totalsRows.push({ label: labels.prepaid, value: money(-totals.prepaidAmount) });
	}
	if (totals.duePayable !== undefined) {
		totalsRows.push({
			label: labels.amountDue,
			value: money(totals.duePayable),
			bold: true,
		});
	}
	ensure(totalsRows.length * 14 + 12);
	const totalsLabelX = PAGE_WIDTH - MARGIN - 220;
	for (const row of totalsRows) {
		const font = row.bold ? fonts.bold : fonts.regular;
		draw(row.label, totalsLabelX, { font, size: row.bold ? 10 : 9 });
		draw(row.value, 0, {
			font,
			size: row.bold ? 10 : 9,
			rightAlignAt: PAGE_WIDTH - MARGIN,
		});
		y -= row.bold ? 16 : 14;
	}
	y -= 12;

	// ---- Payment details.
	const paymentAccount = invoice.paymentMeans?.find(
		(means) => means.payeeAccount?.iban ?? means.payeeAccount?.proprietaryId,
	)?.payeeAccount;
	const paymentPairs: [string, string][] = [
		...(paymentAccount?.iban
			? ([[labels.iban, paymentAccount.iban]] as [string, string][])
			: []),
		...(paymentAccount?.bic
			? ([[labels.bic, paymentAccount.bic]] as [string, string][])
			: []),
		...(paymentAccount?.accountName
			? ([[labels.accountName, paymentAccount.accountName]] as [string, string][])
			: []),
		...(invoice.paymentReference
			? ([[labels.paymentReference, invoice.paymentReference]] as [
					string,
					string,
				][])
			: []),
	];
	const termsText = invoice.paymentTerms?.description;
	if (paymentPairs.length > 0 || termsText) {
		ensure(paymentPairs.length * 13 + 40);
		draw(labels.paymentDetails, MARGIN, { font: fonts.bold, size: 9.5 });
		y -= 14;
		for (const [label, value] of paymentPairs) {
			draw(label, MARGIN, { size: 8.5, color: MUTED });
			draw(value, MARGIN + 110, { size: 9 });
			y -= 13;
		}
		if (termsText) {
			for (const line of wrapText(
				drawable(fonts.regular, termsText),
				fonts.regular,
				8.5,
				CONTENT_WIDTH,
			)) {
				draw(line, MARGIN, { size: 8.5, color: MUTED });
				y -= 11;
			}
		}
		y -= 10;
	}

	// ---- Notes.
	if (invoice.notes?.length) {
		ensure(30);
		draw(labels.notes, MARGIN, { font: fonts.bold, size: 9.5 });
		y -= 14;
		for (const note of invoice.notes) {
			for (const line of wrapText(
				drawable(fonts.regular, note.content),
				fonts.regular,
				8.5,
				CONTENT_WIDTH,
			)) {
				ensure(11);
				draw(line, MARGIN, { size: 8.5, color: MUTED });
				y -= 11;
			}
			y -= 4;
		}
	}

	// ---- Footer: page numbers and document identity.
	const pages = pdfDoc.getPages();
	for (const [index, footerPage] of pages.entries()) {
		const footer = labels.page
			.replace("{page}", String(index + 1))
			.replace("{pages}", String(pages.length));
		const footerSafe = drawable(fonts.regular, footer);
		footerPage.drawText(footerSafe, {
			x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(footerSafe, 8),
			y: MARGIN - 14,
			font: fonts.regular,
			size: 8,
			color: MUTED,
		});
		const identity = drawable(
			fonts.regular,
			`${title} ${invoice.id} — ${invoice.seller.name ?? ""}`,
		);
		footerPage.drawText(identity, {
			x: MARGIN,
			y: MARGIN - 14,
			font: fonts.regular,
			size: 8,
			color: MUTED,
		});
	}

	return pdfDoc;
};

export interface GenerateFacturXPdfOptions extends RenderInvoicePdfOptions {
	/**
	 * Embed into this existing PDF instead of rendering the built-in
	 * template. Note the caveat on `attachFacturXXml` about fonts.
	 */
	existingPdf?: Uint8Array;
	/** Overrides the profile detected from `invoice.profile`. */
	profile?: FacturXProfile;
	/** Timestamp for PDF metadata; defaults to now. */
	date?: Date;
}

export interface GenerateFacturXPdfResult {
	/** The PDF/A-3B hybrid document. */
	pdfBytes: Uint8Array;
	/** The embedded CII XML. */
	xml: string;
}

/**
 * One-call generation of a Factur-X hybrid PDF from a computed invoice
 * (see `computeTotals`): serializes the CII XML, renders the built-in
 * template (or uses `existingPdf`), and embeds the XML as PDF/A-3B.
 */
export const generateFacturXPdf = async (
	invoice: FacturXInvoice,
	options: GenerateFacturXPdfOptions = {},
): Promise<GenerateFacturXPdfResult> => {
	const xml = buildFacturXXml(invoice);
	const labels = labelsForLocale(options.locale);
	const isCreditNote = invoice.typeCode === "381" || invoice.typeCode === "261";
	const pdf = options.existingPdf ?? (await renderInvoicePdf(invoice, options));
	const pdfBytes = await attachFacturXXml({
		pdf,
		xml,
		profile: options.profile ?? detectProfile(invoice.profile) ?? "en16931",
		documentId: invoice.id,
		title: `${isCreditNote ? labels.creditNote : labels.invoice} ${invoice.id}`,
		author: invoice.seller.name ?? "",
		...(options.date ? { date: options.date } : {}),
	});
	return { pdfBytes, xml };
};
