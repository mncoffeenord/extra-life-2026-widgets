import { readFileSync } from 'node:fs';

export function fixture(name: string): unknown {
	return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: { 'content-type': 'application/json;charset=utf-8', ...init.headers },
	});
}

export function textResponse(body: string, status: number, contentType = 'text/html'): Response {
	return new Response(body, { status, headers: { 'content-type': contentType } });
}

export interface RecordedCall {
	url: string;
	headers: Record<string, string>;
}

/** A fake fetch that answers from a queue of responders and records every call. */
export function fakeFetch(...responders: Array<Response | Error | ((call: RecordedCall, init?: RequestInit) => Response | Promise<Response>)>) {
	const calls: RecordedCall[] = [];
	const impl = (async (input: string | URL | Request, init?: RequestInit) => {
		const call = { url: String(input), headers: { ...(init?.headers as Record<string, string>) } };
		calls.push(call);
		const next = responders.shift();
		if (!next) throw new Error(`unexpected fetch: ${call.url}`);
		if (next instanceof Error) throw next;
		return typeof next === 'function' ? next(call, init) : next;
	}) as typeof fetch;
	return { fetch: impl, calls };
}
