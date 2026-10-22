// Pure parts of `npm run theme` (scripts/theme.ts): reading a pasted color scheme, contrast checks, the theme file
// format, and the widget URLs for a theme. Kept here so they are tested.

import type { Config } from './config.ts';
import { sourcesFor, type Style } from './sources.ts';
import { normalizeHex, THEME_KEYS, themeKeyFor, type ThemeColors, type ThemeKey } from './theme.ts';

export interface ParsedScheme {
	colors: Partial<ThemeColors>;
	problems: string[];
	/** True when the input was a bare list of hex codes, applied in THEME_KEYS order. */
	positional: boolean;
}

/**
 * Read a color scheme in whatever shape it was pasted:
 * - JSON: `{ "primary": "#6A1B9A", ... }` or a theme file `{ "colors": { ... } }`
 * - named pairs, one per line or not: `--primary: #6A1B9A;`, `primary-light = 9C4DCC`, `headerText: "#fff"`
 * - a bare list of hex codes (e.g. a coolors.co palette `6a1b9a-9c4dcc-ffb300`), used in order:
 *   primary, primaryLight, accent, text, muted, track, surface, headerText
 */
export function parseColorScheme(input: string): ParsedScheme {
	const colors: Partial<ThemeColors> = {};
	const problems: string[] = [];
	const set = (name: string, value: unknown) => {
		const key = themeKeyFor(name);
		if (!key) return problems.push(`"${name}" is not a theme color (use ${THEME_KEYS.join(', ')})`);
		const hex = typeof value === 'string' ? normalizeHex(value) : null;
		if (!hex) return problems.push(`${key}: ${JSON.stringify(value)} is not a hex color`);
		colors[key] = hex;
	};

	const text = input.trim();
	if (text.startsWith('{')) {
		try {
			const data = JSON.parse(text) as Record<string, unknown>;
			const source = typeof data.colors === 'object' && data.colors !== null ? (data.colors as Record<string, unknown>) : data;
			for (const [name, value] of Object.entries(source)) {
				if (source === data && ['description', 'base', 'name'].includes(name)) continue;
				set(name, value);
			}
			return { colors, problems, positional: false };
		} catch (err) {
			problems.push(`looks like JSON but does not parse (${(err as Error).message}); reading it as text`);
		}
	}

	const pairs = [...text.matchAll(/(-{0,2}[A-Za-z][\w-]*)["']?\s*[:=]\s*["']?(#?[0-9A-Za-z]+)/g)];
	if (pairs.length > 0) {
		for (const [, name, value] of pairs) set(name!, value!);
		return { colors, problems, positional: false };
	}

	const hexes = text
		.split(/[^#0-9A-Fa-f]+/)
		.filter((t) => /^#?[0-9A-Fa-f]{6}$/.test(t) || /^#[0-9A-Fa-f]{3}$/.test(t))
		.map((t) => normalizeHex(t)!);
	if (hexes.length > THEME_KEYS.length) problems.push(`${hexes.length} colors given; only the first ${THEME_KEYS.length} are used`);
	hexes.slice(0, THEME_KEYS.length).forEach((hex, i) => (colors[THEME_KEYS[i]!] = hex));
	if (hexes.length === 0 && text) problems.push('no colors found');
	return { colors, problems, positional: hexes.length > 0 };
}

function luminance(hex: string): number {
	let h = hex.slice(1);
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two hex colors (1 to 21). */
export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi! + 0.05) / (lo! + 0.05);
}

// Pairs that must stay readable on stream, with the WCAG minimum for their text size (large/bold text is 3:1).
const READABLE: Array<[ThemeKey, ThemeKey, number, string]> = [
	['text', 'surface', 4.5, 'main text on the box background'],
	['muted', 'surface', 3, 'secondary text on the box background'],
	['primary', 'surface', 3, 'active numbers on the box background'],
	['headerText', 'primary', 3, 'header text on the header'],
];

/** Readability warnings for a theme (framed style; in transparent style "surface" is your overlay art). */
export function contrastWarnings(colors: ThemeColors): string[] {
	return READABLE.flatMap(([fg, bg, min, what]) => {
		const ratio = contrast(colors[fg], colors[bg]);
		return ratio < min ? [`${what} is hard to read: ${fg} ${colors[fg]} on ${bg} ${colors[bg]} is ${ratio.toFixed(1)}:1 (aim for ${min}:1 or more)`] : [];
	});
}

/** The themes/<name>.json contents: all 8 colors spelled out, so the file stands on its own. */
export function themeFileJson(colors: ThemeColors, description = ''): string {
	const file = { ...(description.trim() ? { description: description.trim() } : {}), colors: Object.fromEntries(THEME_KEYS.map((k) => [k, colors[k]])) };
	return `${JSON.stringify(file, null, '\t')}\n`;
}

/** Add ?theme=<name> to a widget URL (after any ?style=). */
export function withTheme(url: string, name: string): string {
	return `${url}${url.includes('?') ? '&' : '?'}theme=${encodeURIComponent(name)}`;
}

/** Browser source rows for a theme: the configured widgets with ?theme=<name>, unless it is already the default. */
export function themeSources(config: Pick<Config, 'server' | 'display' | 'theme'>, name: string, style: Style = config.display.style) {
	return sourcesFor(config, style).map((row) => ({ ...row, url: name === config.theme.preset ? row.url : withTheme(row.url, name) }));
}
