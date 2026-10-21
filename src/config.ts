import { readFileSync } from 'node:fs';
import { isValidTimeZone, parseEventTime } from './time.ts';

export interface Config {
	server: { host: string; port: number };
	extraLife: { baseUrl: string; apiVersion: string; participantId: string; teamId: string };
	event: { timeZone: string; start: string; end: string; startMs: number; endMs: number };
	polling: {
		participantSeconds: number;
		teamSeconds: number;
		donationsSeconds: number;
		minGapMs: number;
		timeoutMs: number;
		maxBackoffSeconds: number;
	};
	rotation: { intervalSeconds: number; recentCount: number; unknownDonorName: string; privateAmountText: string };
	messageFilter: { enabled: boolean; extraWords: string[] };
	mock: boolean;
}

export class ConfigError extends Error {
	readonly problems: string[];
	constructor(problems: string[]) {
		super(`Invalid config:\n  - ${problems.join('\n  - ')}`);
		this.name = 'ConfigError';
		this.problems = problems;
	}
}

const DEFAULTS = {
	server: { host: '127.0.0.1', port: 4242 },
	extraLife: { baseUrl: 'https://dd.extra-life.org/api', apiVersion: '1.6', participantId: '', teamId: '' },
	event: { timeZone: 'America/Chicago', start: '', end: '' },
	polling: { participantSeconds: 15, teamSeconds: 30, donationsSeconds: 120, minGapMs: 2000, timeoutMs: 10000, maxBackoffSeconds: 300 },
	rotation: { intervalSeconds: 45, recentCount: 10, unknownDonorName: 'Mysterious Hero', privateAmountText: 'Private donation' },
	messageFilter: { enabled: true, extraWords: [] as string[] },
};

type Section = keyof typeof DEFAULTS;

const ID_RE = /^[A-Za-z0-9_-]+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate a parsed config object, filling defaults. Collects every problem before throwing. */
export function parseConfig(raw: unknown, options: { mock?: boolean } = {}): Config {
	const mock = options.mock ?? false;
	const problems: string[] = [];
	const input = isRecord(raw) ? raw : {};
	if (!isRecord(raw)) problems.push('config must be a JSON object');

	const section = <S extends Section>(name: S): (typeof DEFAULTS)[S] => {
		const given = input[name];
		if (given !== undefined && !isRecord(given)) problems.push(`"${name}" must be an object`);
		return { ...DEFAULTS[name], ...(isRecord(given) ? given : {}) } as (typeof DEFAULTS)[S];
	};

	const server = section('server');
	const extraLife = section('extraLife');
	const event = section('event');
	const polling = section('polling');
	const rotation = section('rotation');
	const messageFilter = section('messageFilter');

	const positive = (path: string, v: unknown, { integer = false, min = 0 } = {}) => {
		if (typeof v !== 'number' || !Number.isFinite(v) || v <= min || (integer && !Number.isInteger(v))) {
			problems.push(`${path} must be a ${integer ? 'whole ' : ''}number greater than ${min}`);
		}
	};
	const text = (path: string, v: unknown) => {
		if (typeof v !== 'string' || v.trim() === '') problems.push(`${path} must be a non-empty string`);
	};

	text('server.host', server.host);
	positive('server.port', server.port, { integer: true });
	if (typeof server.port === 'number' && server.port > 65535) problems.push('server.port must be at most 65535');

	text('extraLife.baseUrl', extraLife.baseUrl);
	text('extraLife.apiVersion', extraLife.apiVersion);
	extraLife.participantId = String(extraLife.participantId ?? '').trim();
	extraLife.teamId = String(extraLife.teamId ?? '').trim();
	for (const key of ['participantId', 'teamId'] as const) {
		const id = extraLife[key];
		if (id === '' || id === '123456' || id === '12345') {
			if (!mock) problems.push(`extraLife.${key} is not set (copy it from your Extra Life page URL)`);
		} else if (!ID_RE.test(id)) {
			problems.push(`extraLife.${key} must be a numeric ID or URL alias, got "${id}"`);
		}
	}
	extraLife.baseUrl = String(extraLife.baseUrl).replace(/\/+$/, '');

	let startMs = Number.NaN;
	let endMs = Number.NaN;
	if (typeof event.timeZone !== 'string' || !isValidTimeZone(event.timeZone)) {
		problems.push(`event.timeZone "${String(event.timeZone)}" is not a valid IANA time zone (e.g. "America/Chicago")`);
	} else {
		for (const key of ['start', 'end'] as const) {
			try {
				const ms = parseEventTime(String(event[key] ?? ''), event.timeZone);
				if (key === 'start') startMs = ms;
				else endMs = ms;
			} catch (err) {
				problems.push(`event.${key}: ${(err as Error).message}`);
			}
		}
		if (startMs >= endMs) problems.push('event.end must be after event.start');
	}

	positive('polling.participantSeconds', polling.participantSeconds, { min: 4 });
	positive('polling.teamSeconds', polling.teamSeconds, { min: 4 });
	positive('polling.donationsSeconds', polling.donationsSeconds, { min: 4 });
	positive('polling.minGapMs', polling.minGapMs, { min: -1 });
	positive('polling.timeoutMs', polling.timeoutMs);
	positive('polling.maxBackoffSeconds', polling.maxBackoffSeconds);

	positive('rotation.intervalSeconds', rotation.intervalSeconds);
	positive('rotation.recentCount', rotation.recentCount, { integer: true });
	if (typeof rotation.recentCount === 'number' && rotation.recentCount > 100) problems.push('rotation.recentCount must be at most 100 (API page size)');
	text('rotation.unknownDonorName', rotation.unknownDonorName);
	text('rotation.privateAmountText', rotation.privateAmountText);

	if (typeof messageFilter.enabled !== 'boolean') problems.push('messageFilter.enabled must be true or false');
	if (!Array.isArray(messageFilter.extraWords) || !messageFilter.extraWords.every((w) => typeof w === 'string' && w.trim() !== '')) {
		problems.push('messageFilter.extraWords must be a list of words, e.g. ["spoiler"]');
	}

	if (problems.length > 0) throw new ConfigError(problems);

	return {
		server,
		extraLife,
		event: { ...event, startMs, endMs },
		polling,
		rotation,
		messageFilter,
		mock,
	};
}

export function loadConfig(path: string, options: { mock?: boolean } = {}): Config {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		throw new ConfigError([`cannot read ${path} (copy config.example.json to config.json and edit it)`]);
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		throw new ConfigError([`${path} is not valid JSON: ${(err as Error).message}`]);
	}
	return parseConfig(raw, options);
}
