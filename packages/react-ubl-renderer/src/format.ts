export const isFiniteNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

/** Coerce to a finite number, defaulting to 0. */
export const finite = (value: unknown): number => (isFiniteNumber(value) ? value : 0);

export const formatMoney = (
	currency: string,
	value: number,
	locale: string,
): string => {
	const code = currency || "EUR";
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency: code,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);
	} catch {
		return `${value.toFixed(2)} ${code}`;
	}
};

/** UBL dates are ISO `YYYY-MM-DD` (BT-2 etc.); present them as `DD/MM/YYYY`. */
export const formatDate = (value: string | null | undefined): string => {
	if (!value) return "-";
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	if (!match) return value;
	const [, year, month, day] = match;
	return `${day}/${month}/${year}`;
};

export const formatPercent = (value: number): string =>
	`${value.toFixed(2).replace(/\.?0+$/, "")}%`;
