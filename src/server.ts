// Entry point: `npm start` (live) or `npm run mock` (fake API + preview controls).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp, createClock } from './app.ts';
import { ConfigError, loadConfig, type Config } from './config.ts';
import { ExtraLifeClient } from './extralife/client.ts';
import { parseDonations, parseParticipant, parseTeam } from './extralife/parse.ts';
import { createMessageFilter, DEFAULT_BLOCKED_WORDS, hideFlaggedMessages } from './message-filter.ts';
import { MockApi } from './mock.ts';
import { Poller, type Resource } from './poller.ts';
import { Store } from './store.ts';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const args = process.argv.slice(2);
const mockMode = args.includes('--mock');
const configArg = args[args.indexOf('--config') + 1];
const configPath = args.includes('--config') && configArg ? configArg : root('config.json');

let config: Config;
try {
	const path = mockMode && !existsSync(configPath) ? root('config.example.json') : configPath;
	config = loadConfig(path, { mock: mockMode });
} catch (err) {
	console.error(err instanceof ConfigError ? err.message : err);
	process.exit(1);
}

const clock = createClock();
const mock = mockMode ? new MockApi(() => clock.now()) : undefined;
const { participantId, teamId } = config.extraLife;
const store = new Store(mockMode ? {} : { cacheFile: root('data/cache.json'), cacheKey: `${participantId}/${teamId}` });
if (store.load()) console.log('[store] loaded last-known-good data from data/cache.json');

const client = mock ?? new ExtraLifeClient({ ...config.extraLife, timeoutMs: config.polling.timeoutMs });
// Mock mode polls quickly so preview changes show up in a couple of seconds.
const seconds = (live: number) => (mockMode ? Math.min(live, 2) : live) * 1000;
const limit = config.rotation.recentCount;
const isFlagged = createMessageFilter([...DEFAULT_BLOCKED_WORDS, ...config.messageFilter.extraWords]);
const donations = (data: unknown) => {
	const list = parseDonations(data);
	return config.messageFilter.enabled ? hideFlaggedMessages(list, isFlagged) : list;
};

const resources: Resource[] = [
	{
		key: 'participant',
		path: `participants/${participantId || 'mock'}`,
		intervalMs: seconds(config.polling.participantSeconds),
		apply(data) {
			const next = parseParticipant(data);
			const prev = store.data.participant;
			store.setParticipant(next);
			if (!prev || prev.numDonations !== next.numDonations || prev.raised !== next.raised) poller.trigger('participantDonations');
		},
	},
	{
		key: 'team',
		path: `teams/${teamId || 'mock'}`,
		intervalMs: seconds(config.polling.teamSeconds),
		apply(data) {
			const next = parseTeam(data);
			const prev = store.data.team;
			store.setTeam(next);
			if (!prev || prev.numDonations !== next.numDonations || prev.raised !== next.raised) poller.trigger('teamDonations');
		},
	},
	{
		key: 'participantDonations',
		path: `participants/${participantId || 'mock'}/donations?limit=${limit}`,
		intervalMs: seconds(config.polling.donationsSeconds),
		apply: (data) => store.setDonations('participant', donations(data)),
	},
	{
		key: 'teamDonations',
		path: `teams/${teamId || 'mock'}/donations?limit=${limit}`,
		intervalMs: seconds(config.polling.donationsSeconds),
		apply: (data) => store.setDonations('team', donations(data)),
	},
];

const poller = new Poller({
	client,
	store,
	resources,
	minGapMs: mockMode ? 100 : config.polling.minGapMs,
	maxBackoffMs: mockMode ? 10_000 : config.polling.maxBackoffSeconds * 1000,
});

const server = createApp({ config, store, clock, poller, mock });
server.on('error', (err: NodeJS.ErrnoException) => {
	console.error(err.code === 'EADDRINUSE' ? `Port ${config.server.port} is already in use. Is the server already running?` : err);
	process.exit(1);
});
server.listen(config.server.port, config.server.host, () => {
	const base = `http://${config.server.host === '127.0.0.1' ? 'localhost' : config.server.host}:${config.server.port}`;
	console.log(`Extra Life widgets ${mockMode ? '(MOCK MODE: fake data)' : `(live: participant ${participantId}, team ${teamId})`}`);
	console.log(`  Preview:  ${base}/preview/`);
	for (const w of ['countdown', 'participant-goal', 'team-goal', 'donation-rotator']) console.log(`  Widget:   ${base}/widgets/${w}`);
	console.log(`  Health:   ${base}/api/health`);
	poller.start();
});

const shutdown = () => {
	poller.stop();
	store.save();
	server.close();
	setTimeout(() => process.exit(0), 200).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
