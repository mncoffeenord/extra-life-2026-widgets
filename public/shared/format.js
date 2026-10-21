// @ts-check
// Display formatting shared by widgets and tests.

const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Whole dollars, rounded down so a total is never overstated: 52525.64 -> "$52,525".
 * @param {unknown} value
 */
export function formatDollars(value) {
	const n = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
	return whole.format(Math.floor(n));
}

/**
 * Donation amount: "$25" or "$25.50".
 * @param {number} value
 */
export function formatAmount(value) {
	return Number.isInteger(value) ? whole.format(value) : cents.format(value);
}

/**
 * Progress 0..1+ (can exceed 1 when over goal). 0 when the goal is missing.
 * @param {unknown} raised
 * @param {unknown} goal
 */
export function progress(raised, goal) {
	if (typeof raised !== 'number' || typeof goal !== 'number' || !Number.isFinite(raised) || !Number.isFinite(goal) || goal <= 0) return 0;
	return Math.max(0, raised / goal);
}

/**
 * @param {{ donorName: string | null }} donation
 * @param {string} unknownDonorName
 */
export function donorLabel(donation, unknownDonorName) {
	return donation.donorName && donation.donorName.trim() ? donation.donorName.trim() : unknownDonorName;
}

/**
 * @param {{ amount: number | null }} donation
 * @param {string} privateAmountText
 */
export function amountLabel(donation, privateAmountText) {
	return typeof donation.amount === 'number' && Number.isFinite(donation.amount) ? formatAmount(donation.amount) : privateAmountText;
}
