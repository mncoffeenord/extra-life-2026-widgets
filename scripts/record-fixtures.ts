// Record live API responses as anonymized test fixtures.
//
//   npm run record-fixtures                      # uses IDs from config.json
//   npm run record-fixtures -- --sample <participant-id>   # also record a busy participant's donations
//
// Raw responses go to scripts/raw/ (git-ignored). Anonymized copies go to test/fixtures/.
// Person names, donor IDs, messages, and avatar URLs are scrubbed, and numeric IDs are remapped.
// Team and event names are kept.

import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.ts';
import { USER_AGENT } from '../src/extralife/client.ts';

const root = new URL('../', import.meta.url);
const config = loadConfig(fileURLToPath(new URL('config.json', root)));
const sampleIdx = process.argv.indexOf('--sample');
const sample = sampleIdx > 0 ? process.argv[sampleIdx + 1] : undefined;
const { participantId, teamId } = config.extraLife;

const targets: Array<[string, string]> = [
	['participant', `participants/${participantId}`],
	['participant-donations', `participants/${participantId}/donations`],
	['team', `teams/${teamId}`],
	['team-participants', `teams/${teamId}/participants`],
	['team-donations', `teams/${teamId}/donations`],
];
if (sample) {
	targets.push(['sample-participant', `participants/${sample}`]);
	targets.push(['sample-participant-donations', `participants/${sample}/donations`]);
}

// --- anonymizer ---------------------------------------------------------------
const idMaps = new Map<string, Map<string, number | string>>();
function remap(kind: string, value: unknown, make: (n: number) => number | string): unknown {
	if (value === null || value === undefined) return value;
	let m = idMaps.get(kind);
	if (!m) idMaps.set(kind, (m = new Map()));
	const key = String(value);
	if (!m.has(key)) m.set(key, make(m.size + 1));
	return m.get(key);
}
const names = new Map<string, string>();
function fakeName(real: unknown, prefix: string): unknown {
	if (typeof real !== 'string') return real;
	if (!names.has(real)) names.set(real, `${prefix} ${names.size + 1}`);
	return names.get(real);
}
const hex = (n: number) => n.toString(16).toUpperCase().padStart(16, '0');

let teamNames = new Set<string>();
function scrub(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(scrub);
	if (typeof value !== 'object' || value === null) return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) {
		switch (k) {
			case 'participantID': out[k] = remap('participant', v, (n) => 900000 + n); break;
			case 'teamID': case 'sourceTeamID': out[k] = remap('team', v, (n) => 90000 + n); break;
			case 'donorID': out[k] = remap('donor', v, (n) => `D${hex(n).slice(1)}`); break;
			case 'donationID': out[k] = remap('donation', v, hex); break;
			case 'displayName': case 'captainDisplayName': case 'recipientName':
				out[k] = typeof v === 'string' && teamNames.has(v) ? v : fakeName(v, 'Person'); break;
			case 'message': out[k] = v ? 'Sample donor message' : v; break;
			case 'avatarImageURL': case 'recipientImageURL': out[k] = 'https://static.donordrive.com/clients/extralife/img/avatar-constituent-default.gif'; break;
			case 'links': out[k] = { page: 'https://dd.extra-life.org/', donate: 'https://dd.extra-life.org/' }; break;
			case 'streamingChannel': out[k] = v ? 'sample_channel' : v; break;
			case 'urlAlias': out[k] = v ? 'sample-alias' : v; break;
			case 'teamName': case 'name': out[k] = typeof v === 'string' && !teamNames.has(v) ? 'Sample Team' : v; break;
			default: out[k] = scrub(v);
		}
	}
	return out;
}

// --- record ------------------------------------------------------------------
mkdirSync(new URL('scripts/raw/', root), { recursive: true });
mkdirSync(new URL('test/fixtures/', root), { recursive: true });
const raw: Array<[string, unknown]> = [];
for (const [name, path] of targets) {
	const url = new URL(`${config.extraLife.baseUrl}/${path}`);
	url.searchParams.set('version', config.extraLife.apiVersion);
	const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
	const body = await res.text();
	console.log(`${res.status} ${name} (${body.length} bytes, etag ${res.headers.get('etag')?.slice(0, 12)}…)`);
	writeFileSync(new URL(`scripts/raw/${name}.json`, root), body);
	if (res.ok) raw.push([name, JSON.parse(body)]);
	await sleep(3000); // be polite: the API asks for <= 1 request / 15s sustained
}
// Keep only the configured team's name; other teams (e.g. the --sample participant's) are scrubbed too.
const ownTeam = raw.find(([name]) => name === 'team')?.[1] as Record<string, unknown> | undefined;
teamNames = new Set(typeof ownTeam?.name === 'string' ? [ownTeam.name] : []);
for (const [name, data] of raw) {
	writeFileSync(new URL(`test/fixtures/${name}.json`, root), `${JSON.stringify(scrub(data), null, '\t')}\n`);
}
console.log(`Wrote ${raw.length} anonymized fixtures to test/fixtures/`);
