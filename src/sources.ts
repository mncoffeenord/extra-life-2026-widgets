// Every widget's and scene's browser-source geometry, in one place. Used for the page injection (frame specs),
// /api/display (the preview), and the setup script's source list.
//
// Positions are the GamePlan42 overlay layout on a 1920x1080 canvas (checkpoint "marvin-framed-widgets").
// Transparent sources fill the white area inside an overlay box; framed sources draw the whole box themselves,
// so they can go anywhere.

import type { Config, Titles } from './config.ts';

export type WidgetId = 'countdown' | 'participant-goal' | 'team-goal' | 'donation-rotator' | 'donation-messages';
export type Style = 'framed' | 'transparent';

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Streamlabs canvases the docs and MY-SOURCES.md give numbers for. Every rect here is in 1920x1080 design pixels;
 * on a 2560x1440 (1440p, "2K") canvas multiply by 4/3. Widgets and scenes size their content from the source's
 * height, so a scaled source renders crisply rather than being stretched. (public/preview/preview.js has a copy.)
 */
export const CANVAS_1440P = { w: 2560, h: 1440, scale: 4 / 3 } as const;

export function scaleRect(r: Rect, scale: number): Rect {
	return { x: Math.round(r.x * scale), y: Math.round(r.y * scale), w: Math.round(r.w * scale), h: Math.round(r.h * scale) };
}

export interface WidgetSpec {
	id: WidgetId;
	name: string;
	titleKey: keyof Titles;
	/** the whole box (framed source) */
	box: Rect;
	/** the white area inside the box (transparent source) */
	body: Rect;
	/** header height and font size in px at the design size, and title alignment */
	head: number;
	headSize: number;
	align: 'center' | 'left';
}

const footer = (x: number) => ({ box: { x, y: 944, w: 494, h: 128 }, body: { x: x + 3, y: 987, w: 488, h: 82 }, head: 40, headSize: 22, align: 'center' as const });

export const WIDGETS: Record<WidgetId, WidgetSpec> = {
	countdown: { id: 'countdown', name: 'Stream countdown', titleKey: 'countdown', ...footer(20) },
	'participant-goal': { id: 'participant-goal', name: 'My Extra Life goal', titleKey: 'participantGoal', ...footer(530) },
	'team-goal': { id: 'team-goal', name: 'Team goal', titleKey: 'teamGoal', ...footer(1040) },
	'donation-rotator': {
		id: 'donation-rotator', name: 'Donations received', titleKey: 'donations',
		box: { x: 1580, y: 290, w: 320, h: 96 }, body: { x: 1583, y: 325, w: 314, h: 58 }, head: 32, headSize: 18, align: 'left',
	},
	'donation-messages': {
		id: 'donation-messages', name: 'Donations received, with messages', titleKey: 'donations',
		box: { x: 1580, y: 290, w: 320, h: 143 }, body: { x: 1583, y: 325, w: 314, h: 105 }, head: 32, headSize: 18, align: 'left',
	},
};

export function isWidgetId(value: string): value is WidgetId {
	return Object.hasOwn(WIDGETS, value);
}

/** Header title for a widget, with "{team}" filled in from the team's name. */
export function titleFor(spec: WidgetSpec, titles: Titles, teamName: string | null): string {
	return titles[spec.titleKey].replaceAll('{team}', teamName ?? 'Team');
}

export interface SourceRow {
	id: WidgetId;
	name: string;
	url: string;
	rect: Rect;
}

function baseUrl(config: Pick<Config, 'server'>): string {
	const host = config.server.host === '127.0.0.1' || config.server.host === '0.0.0.0' ? 'localhost' : config.server.host;
	return `http://${host}:${config.server.port}`;
}

/** The browser sources for a setup: the three footer widgets plus the chosen Donations version. */
export function sourcesFor(config: Pick<Config, 'server' | 'display'>, style: Style = config.display.style): SourceRow[] {
	const base = baseUrl(config);
	const donations: WidgetId = config.display.donations === 'messages' ? 'donation-messages' : 'donation-rotator';
	const ids: WidgetId[] = ['countdown', 'participant-goal', 'team-goal', donations];
	// Only add ?style= when it differs from the configured default, so URLs stay short.
	const suffix = style === config.display.style ? '' : `?style=${style}`;
	return ids.map((id) => {
		const spec = WIDGETS[id];
		return { id, name: spec.name, url: `${base}/widgets/${id}${suffix}`, rect: style === 'framed' ? spec.box : spec.body };
	});
}

/**
 * Full-screen scenes (public/scenes/). Each goes on its own Streamlabs scene as a 1920x1080 source at 0, 0. They use
 * their own design palettes (BRB and Ending each have two looks, ?look=light), so ?style= and ?theme= do not apply.
 */
export const SCENES = [
	{ id: 'be-right-back', query: '', name: 'Be Right Back scene', rect: { x: 0, y: 0, w: 1920, h: 1080 } },
	{ id: 'be-right-back', query: 'look=light', name: 'Be Right Back scene (light)', rect: { x: 0, y: 0, w: 1920, h: 1080 } },
	{ id: 'ending', query: '', name: 'Ending scene', rect: { x: 0, y: 0, w: 1920, h: 1080 } },
	{ id: 'ending', query: 'look=light', name: 'Ending scene (light)', rect: { x: 0, y: 0, w: 1920, h: 1080 } },
] as const satisfies readonly { id: string; query: string; name: string; rect: Rect }[];

export interface SceneRow {
	id: string;
	name: string;
	url: string;
	rect: Rect;
}

export function scenesFor(config: Pick<Config, 'server'>): SceneRow[] {
	const base = baseUrl(config);
	return SCENES.map((s) => ({ id: s.id, name: s.name, url: `${base}/scenes/${s.id}${s.query ? `?${s.query}` : ''}`, rect: { ...s.rect } }));
}

/**
 * Starting Soon is not a live page: an animated GIF (Image source, stretched to the canvas) with Extra Life's own
 * stock tracker laid over the plain bar the design leaves at the bottom (1920x88 at 0, 992). The data follows
 * participantID; eventID only picks the bar's styling. 553 (owner's choice) gives the dark #1A4C6D bar and white logo
 * the design matches; the real 2026 event, 562, gives a lighter bar and a colour logo. The GIF is a 960x540 preview
 * render, so it is stretched to 1920x1080.
 */
export const STARTING_SOON = {
	gif: 'public/scenes/starting-soon/starting-soon.gif',
	trackerRect: { x: 0, y: 992, w: 1920, h: 88 },
	eventId: '553',
} as const;

export function startingSoonTrackerUrl(participantId: string): string {
	return `https://dd.extra-life.org/index.cfm?fuseaction=donorDrive.streamingOverlay&eventID=${STARTING_SOON.eventId}&participantID=${participantId}`;
}
