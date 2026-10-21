// Color themes for the widgets. A theme is a preset plus optional hex overrides, turned into CSS custom
// properties that the server injects into every widget page.

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

/** Resolve a preset name plus overrides. Unknown presets and bad hex values throw (config validation reports them). */
export function resolveTheme(preset: string, overrides: Partial<Record<string, string>> = {}): ThemeColors {
	const base = THEME_PRESETS[preset];
	if (!base) throw new Error(`unknown theme preset "${preset}" (choose ${Object.keys(THEME_PRESETS).join(', ')})`);
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
