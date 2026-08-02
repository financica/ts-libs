/** Labels used by the built-in invoice template. */
export type RenderLocale = "en" | "fr" | "de" | "nl";

export interface RenderLabels {
	invoice: string;
	creditNote: string;
	issueDate: string;
	dueDate: string;
	deliveryDate: string;
	billingPeriod: string;
	buyerReference: string;
	purchaseOrder: string;
	contractReference: string;
	precedingInvoice: string;
	billedTo: string;
	vatId: string;
	taxId: string;
	description: string;
	quantity: string;
	unitPrice: string;
	vat: string;
	amount: string;
	lineTotal: string;
	allowances: string;
	charges: string;
	totalExclVat: string;
	vatLine: string;
	rounding: string;
	totalInclVat: string;
	prepaid: string;
	amountDue: string;
	paymentDetails: string;
	iban: string;
	bic: string;
	accountName: string;
	paymentReference: string;
	paymentTerms: string;
	notes: string;
	page: string;
	reverseCharge: string;
}

const en: RenderLabels = {
	invoice: "Invoice",
	creditNote: "Credit note",
	issueDate: "Issue date",
	dueDate: "Due date",
	deliveryDate: "Delivery date",
	billingPeriod: "Billing period",
	buyerReference: "Buyer reference",
	purchaseOrder: "Purchase order",
	contractReference: "Contract",
	precedingInvoice: "Relates to invoice",
	billedTo: "Billed to",
	vatId: "VAT",
	taxId: "Tax ID",
	description: "Description",
	quantity: "Qty",
	unitPrice: "Unit price",
	vat: "VAT %",
	amount: "Amount",
	lineTotal: "Line total",
	allowances: "Discounts",
	charges: "Charges",
	totalExclVat: "Total excl. VAT",
	vatLine: "VAT {rate}%",
	rounding: "Rounding",
	totalInclVat: "Total incl. VAT",
	prepaid: "Prepaid",
	amountDue: "Amount due",
	paymentDetails: "Payment details",
	iban: "IBAN",
	bic: "BIC",
	accountName: "Account name",
	paymentReference: "Payment reference",
	paymentTerms: "Payment terms",
	notes: "Notes",
	page: "Page {page} / {pages}",
	reverseCharge: "Reverse charge",
};

const fr: RenderLabels = {
	invoice: "Facture",
	creditNote: "Avoir",
	issueDate: "Date d'émission",
	dueDate: "Date d'échéance",
	deliveryDate: "Date de livraison",
	billingPeriod: "Période de facturation",
	buyerReference: "Référence acheteur",
	purchaseOrder: "Bon de commande",
	contractReference: "Contrat",
	precedingInvoice: "Facture concernée",
	billedTo: "Facturé à",
	vatId: "TVA",
	taxId: "Identifiant fiscal",
	description: "Description",
	quantity: "Qté",
	unitPrice: "Prix unitaire",
	vat: "TVA %",
	amount: "Montant",
	lineTotal: "Total lignes",
	allowances: "Remises",
	charges: "Frais",
	totalExclVat: "Total HT",
	vatLine: "TVA {rate}%",
	rounding: "Arrondi",
	totalInclVat: "Total TTC",
	prepaid: "Déjà payé",
	amountDue: "Montant à payer",
	paymentDetails: "Informations de paiement",
	iban: "IBAN",
	bic: "BIC",
	accountName: "Titulaire du compte",
	paymentReference: "Référence de paiement",
	paymentTerms: "Conditions de paiement",
	notes: "Notes",
	page: "Page {page} / {pages}",
	reverseCharge: "Autoliquidation",
};

const de: RenderLabels = {
	invoice: "Rechnung",
	creditNote: "Gutschrift",
	issueDate: "Rechnungsdatum",
	dueDate: "Fälligkeitsdatum",
	deliveryDate: "Lieferdatum",
	billingPeriod: "Abrechnungszeitraum",
	buyerReference: "Käuferreferenz",
	purchaseOrder: "Bestellnummer",
	contractReference: "Vertrag",
	precedingInvoice: "Bezug auf Rechnung",
	billedTo: "Rechnungsempfänger",
	vatId: "USt-IdNr.",
	taxId: "Steuernummer",
	description: "Beschreibung",
	quantity: "Menge",
	unitPrice: "Einzelpreis",
	vat: "USt. %",
	amount: "Betrag",
	lineTotal: "Zwischensumme",
	allowances: "Nachlässe",
	charges: "Zuschläge",
	totalExclVat: "Summe netto",
	vatLine: "USt. {rate}%",
	rounding: "Rundung",
	totalInclVat: "Summe brutto",
	prepaid: "Bereits gezahlt",
	amountDue: "Zahlbetrag",
	paymentDetails: "Zahlungsinformationen",
	iban: "IBAN",
	bic: "BIC",
	accountName: "Kontoinhaber",
	paymentReference: "Verwendungszweck",
	paymentTerms: "Zahlungsbedingungen",
	notes: "Hinweise",
	page: "Seite {page} / {pages}",
	reverseCharge: "Steuerschuldnerschaft des Leistungsempfängers",
};

const nl: RenderLabels = {
	invoice: "Factuur",
	creditNote: "Creditnota",
	issueDate: "Factuurdatum",
	dueDate: "Vervaldatum",
	deliveryDate: "Leveringsdatum",
	billingPeriod: "Factuurperiode",
	buyerReference: "Referentie koper",
	purchaseOrder: "Bestelbon",
	contractReference: "Contract",
	precedingInvoice: "Betreft factuur",
	billedTo: "Gefactureerd aan",
	vatId: "BTW",
	taxId: "Fiscaal nummer",
	description: "Omschrijving",
	quantity: "Aantal",
	unitPrice: "Eenheidsprijs",
	vat: "BTW %",
	amount: "Bedrag",
	lineTotal: "Totaal lijnen",
	allowances: "Kortingen",
	charges: "Toeslagen",
	totalExclVat: "Totaal excl. btw",
	vatLine: "BTW {rate}%",
	rounding: "Afronding",
	totalInclVat: "Totaal incl. btw",
	prepaid: "Reeds betaald",
	amountDue: "Te betalen",
	paymentDetails: "Betalingsgegevens",
	iban: "IBAN",
	bic: "BIC",
	accountName: "Rekeninghouder",
	paymentReference: "Betalingsreferentie",
	paymentTerms: "Betalingsvoorwaarden",
	notes: "Opmerkingen",
	page: "Pagina {page} / {pages}",
	reverseCharge: "Btw verlegd",
};

const LABELS: Record<RenderLocale, RenderLabels> = { en, fr, de, nl };

/** Resolve labels for a locale; region suffixes ("fr-FR") are accepted. */
export const labelsForLocale = (locale: string | undefined): RenderLabels => {
	const language = (locale ?? "en").split("-")[0]?.toLowerCase() ?? "en";
	return LABELS[language as RenderLocale] ?? en;
};
