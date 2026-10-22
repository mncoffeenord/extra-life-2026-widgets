// Color themes for the widgets. A theme is a named set of 8 colors (built-in presets below, plus custom themes saved
// as themes/<name>.json by `npm run theme`), optionally with hex overrides, turned into CSS custom properties that the
// server injects into every widget page.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const THEME_KEYS = ['primary', 'primaryLight', 'accent', 'text', 'muted', 'track', 'surface', 'headerText'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export type ThemeColors = Record<ThemeKey, string>;

/** What each color is used for (shown by the setup script). */
export const THEME_KEY_HELP: Record<ThemeKey, string> = {
	primary: 'box border and header, active numbers (raised, clock), MY PAGE tag, progress bar',
	primaryLight: 'progress bar gradient end',
	accent: 'over-goal bar, TEAM tag, Overtime tag, new-donation flash',
	text: 'main text (names, goal amounts)',
	muted: 'secondary text (time ago, private amounts)',
	track: 'progress bar background, "Starts in" tag',
	surface: 'box background (framed style only)',
	headerText: 'header text and text on primary-colored tags',
};

export const THEME_PRESETS: Record<string, ThemeColors> = {
	'extra-life': {
		primary: '#0E7CA2', primaryLight: '#1C9ED6', accent: '#FFCB05', text: '#253746',
		muted: '#5B6B78', track: '#E3F6FC', surface: '#FFFFFF', headerText: '#FFFFFF',
	},
	midnight: {
		primary: '#1C9ED6', primaryLight: '#5BC0EB', accent: '#FFCB05', text: '#F1F5F9',
		muted: '#A9B6C2', track: '#2E3D4C', surface: '#1B2733', headerText: '#FFFFFF',
	},
	mono: {
		primary: '#2B2B2B', primaryLight: '#6B6B6B', accent: '#E8B100', text: '#1A1A1A',
		muted: '#666666', track: '#E6E6E6', surface: '#FFFFFF', headerText: '#FFFFFF',
	},
};

export const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Theme names: lowercase letters, digits and dashes, so they work as file names and in URLs (?theme=name). */
export const THEME_NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Every theme the server knows, by name: the built-in presets plus custom themes from themes/. */
export type ThemeRegistry = Record<string, ThemeColors>;

/** Resolve a theme name plus overrides. Unknown themes and bad hex values throw (config validation reports them). */
export function resolveTheme(preset: string, overrides: Partial<Record<string, string>> = {}, registry: ThemeRegistry = THEME_PRESETS): ThemeColors {
	const base = Object.hasOwn(registry, preset) ? registry[preset] : undefined;
	if (!base) throw new Error(`unknown theme preset "${preset}" (choose ${Object.keys(registry).join(', ')})`);
	const colors = { ...base };
	for (const [key, value] of Object.entries(overrides)) {
		if (!(THEME_KEYS as readonly string[]).includes(key)) throw new Error(`unknown theme color "${key}" (use ${THEME_KEYS.join(', ')})`);
		if (typeof value !== 'string' || !HEX_RE.test(value)) throw new Error(`theme color ${key} must be a hex color like "#0E7CA2", got ${JSON.stringify(value)}`);
		colors[key as ThemeKey] = value.toUpperCase();
	}
	return colors;
}

const CSS_VAR: Record<ThemeKey, string> = {
	primary: '--primary', primaryLight: '--primary-light', accent: '--accent', text: '--text',
	muted: '--muted', track: '--track', surface: '--surface', headerText: '--header-text',
};

export function themeCss(colors: ThemeColors): string {
	return `:root{${THEME_KEYS.map((k) => `${CSS_VAR[k]}:${colors[k]}`).join(';')}}`;
}

const KEY_ALIASES: Record<string, ThemeKey> = Object.fromEntries(THEME_KEYS.map((k) => [k.toLowerCase(), k]));

/** Map a color name in any common spelling (primaryLight, primary-light, --primary-light, header_text) to its key. */
export function themeKeyFor(name: string): ThemeKey | null {
	return KEY_ALIASES[name.toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

/** Accept "#0E7CA2", "0E7CA2", "#0e7" or "0e7" (URLs cannot hold a bare "#"). Returns "#0E7CA2" style, or null. */
export function normalizeHex(value: string): string | null {
	const v = value.trim();
	const hex = v.startsWith('#') ? v : `#${v}`;
	return HEX_RE.test(hex) ? hex.toUpperCase() : null;
}

/**
 * Load custom themes from a folder of <name>.json files: `{ "description": "...", "base": "midnight", "colors": {...} }`.
 * `base` (a built-in preset, default extra-life) fills any colors the file leaves out. Bad files are skipped and
 * reported in `problems`; a missing folder is just empty.
 */
export function loadThemeDir(dir: string): { themes: ThemeRegistry; descriptions: Record<string, string>; problems: string[] } {
	const themes: ThemeRegistry = {};
	const descriptions: Record<string, string> = {};
	const problems: string[] = [];
	let files: string[];
	try {
		files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
	} catch {
		return { themes, descriptions, problems };
	}
	for (const file of files) {
		const name = file.slice(0, -'.json'.length);
		try {
			if (!THEME_NAME_RE.test(name)) throw new Error('the file name must be lowercase letters, digits and dashes, e.g. purple-night.json');
			if (Object.hasOwn(THEME_PRESETS, name)) throw new Error(`"${name}" is a built-in theme; pick another name`);
			const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
			if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('must be a JSON object');
			const { base = 'extra-life', colors = {}, description } = data as Record<string, unknown>;
			if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) throw new Error('"colors" must be an object of hex colors');
			themes[name] = resolveTheme(String(base), colors as Record<string, string>);
			if (typeof description === 'string' && description.trim()) descriptions[name] = description.trim();
		} catch (err) {
			problems.push(`themes/${file}: ${(err as Error).message}`);
		}
	}
	return { themes, descriptions, problems };
}

/**
 * Per-source theme from a widget URL: `?theme=midnight` picks a theme by name, and color parameters override single
 * colors (`&primary=6A1B9A&headerText=FFF`). Without ?theme= the overrides apply on top of the configured theme. Bad
 * values are reported in `problems` and ignored, so a typo never blanks a widget on stream.
 */
export function themeFromQuery(query: URLSearchParams, fallback: ThemeColors, registry: ThemeRegistry): { colors: ThemeColors; problems: string[] } {
	const problems: string[] = [];
	const name = query.get('theme')?.trim();
	let colors = fallback;
	if (name) {
		if (Object.hasOwn(registry, name)) colors = registry[name]!;
		else problems.push(`unknown theme "${name}" (available: ${Object.keys(registry).join(', ')}); using the configured theme`);
	}
	colors = { ...colors };
	for (const [param, value] of query) {
		const key = themeKeyFor(param);
		if (!key || param === 'theme') continue;
		const hex = normalizeHex(value);
		if (hex) colors[key] = hex;
		else problems.push(`${param}=${value} is not a hex color (use e.g. ${param}=6A1B9A); ignored`);
	}
	return { colors, problems };
}
