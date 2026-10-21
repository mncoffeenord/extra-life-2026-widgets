// HTTP layer: JSON API, server-sent events, mock controls, and static widget pages.

import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clockView } from '../public/shared/countdown.js';
import type { Config } from './config.ts';
import type { MockApi } from './mock.ts';
import type { Poller } from './poller.ts';
import { RESOURCE_KEYS, type Store } from './store.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATIC_DIRS: Record<string, string> = {
	'/widgets/': join(ROOT, 'public/widgets'),
	'/shared/': join(ROOT, 'public/shared'),
	'/preview/': join(ROOT, 'public/preview'),
	'/fonts/': join(ROOT, 'node_modules/@fontsource-variable/inter/files'),
	'/local-assets/': join(ROOT, 'local-assets'),
};
const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
};

export interface Clock {
	now(): number;
	offsetMs: number;
}

export function createClock(): Clock {
	return {
		offsetMs: 0,
		now() {
			return Date.now() + this.offsetMs;
		},
	};
}

export interface AppDeps {
	config: Config;
	store: Store;
	clock: Clock;
	poller?: Poller;
	mock?: MockApi;
	log?: (message: string) => void;
}

export function snapshot({ config, store, clock, mock }: AppDeps) {
	return {
		version: store.version,
		serverNow: clock.now(),
		mode: mock ? 'mock' : 'live',
		event: { startMs: config.event.startMs, endMs: config.event.endMs, timeZone: config.event.timeZone },
		participant: store.data.participant,
		team: store.data.team,
		donations: store.data.donations,
		ownParticipantId: store.data.participant?.id ?? null,
		rotation: {
			intervalMs: config.rotation.intervalSeconds * 1000,
			unknownDonorName: config.rotation.unknownDonorName,
			privateAmountText: config.rotation.privateAmountText,
		},
	};
}

export function health({ store, clock, poller, mock }: AppDeps, sseClients: number) {
	const now = clock.now();
	const resources = Object.fromEntries(
		RESOURCE_KEYS.map((k) => {
			const s = store.status[k];
			const due = poller?.nextDueAt(k);
			return [k, {
				lastSuccessAgeSeconds: s.lastSuccessAt === null ? null : Math.round((Date.now() - s.lastSuccessAt) / 1000),
				lastError: s.lastError,
				consecutiveFailures: s.consecutiveFailures,
				nextPollInSeconds: due === undefined ? null : Math.max(0, Math.round((due - Date.now()) / 1000)),
			}];
		}),
	);
	const hasData = store.data.participant !== null && store.data.team !== null;
	const failing = RESOURCE_KEYS.some((k) => store.status[k].consecutiveFailures > 0);
	return {
		ok: hasData && !failing,
		hasData,
		mode: mock ? 'mock' : 'live',
		mockApiDown: mock?.down ?? false,
		serverNow: now,
		clockOffsetMs: clock.offsetMs,
		sseClients,
		resources,
	};
}

export function createApp(deps: AppDeps): Server {
	const { store, clock, config, mock, poller } = deps;
	const log = deps.log ?? ((m: string) => console.log(m));
	const clients = new Set<ServerResponse>();

	const broadcast = () => {
		const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot(deps))}\n\n`;
		for (const res of clients) res.write(payload);
	};
	store.on('change', broadcast);
	const heartbeat = setInterval(() => {
		for (const res of clients) res.write(': ping\n\n');
	}, 15_000);
	heartbeat.unref();

	const server = createServer(async (req, res) => {
		try {
			const url = new URL(req.url ?? '/', 'http://localhost');
			const path = url.pathname;
			if (req.method === 'GET' || req.method === 'HEAD') {
				switch (path) {
					case '/':
						res.writeHead(302, { Location: '/preview/' }).end();
						return;
					case '/api/state':
						return json(res, snapshot(deps));
					case '/api/participant':
						return json(res, withStatus(store.data.participant, store.status.participant.lastSuccessAt));
					case '/api/team':
						return json(res, withStatus(store.data.team, store.status.team.lastSuccessAt));
					case '/api/donations':
						return json(res, store.data.donations);
					case '/api/countdown': {
						const now = clock.now();
						return json(res, { serverNow: now, ...snapshot(deps).event, ...clockView(now, config.event.startMs, config.event.endMs) });
					}
					case '/api/health':
						return json(res, health(deps, clients.size));
					case '/api/stream':
						return openStream(req, res);
				}
				const widget = /^\/widgets\/([a-z0-9-]+)\/?$/.exec(path);
				if (widget) return serveFile(res, join(STATIC_DIRS['/widgets/']!, widget[1]!, 'index.html'));
				if (path === '/preview') {
					res.writeHead(302, { Location: '/preview/' }).end();
					return;
				}
				for (const [prefix, dir] of Object.entries(STATIC_DIRS)) {
					if (path.startsWith(prefix)) {
						const rel = decodeURIComponent(path.slice(prefix.length)) || 'index.html';
						const file = normalize(join(dir, rel));
						if (!file.startsWith(dir + sep)) return notFound(res);
						return serveFile(res, file.endsWith(sep) ? join(file, 'index.html') : file);
					}
				}
				return notFound(res);
			}
			if (req.method === 'POST' && path.startsWith('/api/mock/')) {
				if (!mock) return json(res, { error: 'mock controls are only available with --mock' }, 403);
				const body = await readJson(req);
				handleMock(path.slice('/api/mock/'.length), body);
				return json(res, health(deps, clients.size));
			}
			return json(res, { error: 'method not allowed' }, 405);
		} catch (err) {
			log(`[http] ${req.method} ${req.url}: ${(err as Error).message}`);
			if (!res.headersSent) json(res, { error: (err as Error).message }, 400);
			else res.end();
		}
	});
	server.on('close', () => {
		clearInterval(heartbeat);
		store.off('change', broadcast);
		for (const res of clients) res.end();
	});

	function openStream(req: IncomingMessage, res: ServerResponse) {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
		});
		res.write(`retry: 3000\nevent: snapshot\ndata: ${JSON.stringify(snapshot(deps))}\n\n`);
		clients.add(res);
		req.on('close', () => clients.delete(res));
	}

	function handleMock(action: string, body: Record<string, unknown>) {
		if (!mock) return;
		const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : undefined);
		switch (action) {
			case 'participant':
			case 'team':
				mock.setTotals(action, { raised: num(body.raised), goal: num(body.goal) });
				poller?.trigger(action);
				break;
			case 'donation': {
				const scope = body.scope === 'team' ? 'team' : 'mine';
				const amount = body.amount === null ? null : num(body.amount);
				const message = typeof body.message === 'string' && body.message.trim() !== '' ? body.message.trim().slice(0, 500) : null;
				mock.addDonation({ scope, donorName: body.donorName === null ? null : typeof body.donorName === 'string' ? body.donorName : undefined, amount, message });
				for (const key of ['participant', 'team', 'participantDonations', 'teamDonations'] as const) poller?.trigger(key);
				break;
			}
			case 'outage':
				mock.down = body.down === true;
				for (const key of RESOURCE_KEYS) poller?.trigger(key);
				break;
			case 'clock': {
				if (typeof body.at === 'number') clock.offsetMs = body.at - Date.now();
				else if (typeof body.offsetMs === 'number') clock.offsetMs = body.offsetMs;
				else clock.offsetMs = 0;
				broadcast();
				break;
			}
			default:
				throw new Error(`unknown mock action "${action}"`);
		}
	}

	return server;
}

function withStatus<T>(data: T, lastSuccessAt: number | null) {
	return { data, updatedAt: lastSuccessAt === null ? null : new Date(lastSuccessAt).toISOString() };
}

function json(res: ServerResponse, body: unknown, status = 200) {
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
	res.end(JSON.stringify(body));
}

function notFound(res: ServerResponse) {
	res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
}

function serveFile(res: ServerResponse, file: string) {
	let size: number;
	try {
		const st = statSync(file);
		if (!st.isFile()) return notFound(res);
		size = st.size;
	} catch {
		return notFound(res);
	}
	res.writeHead(200, {
		'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
		'Content-Length': size,
		'Cache-Control': 'no-cache',
	});
	createReadStream(file).pipe(res);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
	let raw = '';
	for await (const chunk of req) {
		raw += chunk;
		if (raw.length > 10_000) throw new Error('body too large');
	}
	if (!raw.trim()) return {};
	const parsed = JSON.parse(raw);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('expected a JSON object');
	return parsed;
}
