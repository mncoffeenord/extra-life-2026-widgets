// Terminal prompts shared by `npm run setup` and `npm run theme`.
//
// A small line queue instead of readline's question(): piped answers that arrive while the script is busy (e.g.
// checking an ID online) are kept until asked for, rather than dropped. With `interactive: false` every question
// takes its default.

import { createInterface } from 'node:readline';

export function createPrompter({ interactive }: { interactive: boolean }) {
	const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY }) : null;
	const pendingLines: string[] = [];
	let waiting: ((line: string | null) => void) | null = null;
	let inputClosed = false;
	rl?.on('line', (line) => (waiting ? (waiting(line), (waiting = null)) : pendingLines.push(line)));
	rl?.on('close', () => {
		inputClosed = true;
		waiting?.(null);
		waiting = null;
	});
	function readLine(prompt: string): Promise<string> {
		// Through readline, not a bare write: on a terminal resize readline redraws the line with its own prompt,
		// which would otherwise be its default "> " and wipe the question.
		if (rl) {
			rl.setPrompt(prompt);
			rl.prompt(true);
		} else process.stdout.write(prompt);
		const queued = pendingLines.shift();
		if (queued !== undefined) return Promise.resolve(queued);
		if (inputClosed) return Promise.reject(new Error('input ended before the script finished'));
		return new Promise((resolve, reject) => {
			waiting = (line) => (line === null ? reject(new Error('input ended before the script finished')) : resolve(line));
		});
	}
	const say = (s = '') => console.log(s);

	async function ask(question: string, def: string, validate?: (v: string) => string | null): Promise<string> {
		for (;;) {
			const raw = rl ? (await readLine(`${question}${def ? ` [${def}]` : ''}: `)).trim() : '';
			const value = raw || def;
			const problem = validate?.(value) ?? null;
			if (!problem) return value;
			if (!rl || !process.stdin.isTTY) throw new Error(`${question}: ${problem}`);
			say(`  ${problem}`);
		}
	}

	async function choose<T extends string>(question: string, options: Array<[T, string]>, def: T): Promise<T> {
		say(question);
		options.forEach(([value, label], i) => say(`  ${i + 1}) ${value}${label ? `: ${label}` : ''}`));
		const answer = await ask('Choose', String(options.findIndex(([v]) => v === def) + 1), (v) =>
			options.some(([o], i) => v === String(i + 1) || v === o) ? null : `enter 1-${options.length}`,
		);
		return (options.find(([o], i) => answer === String(i + 1) || answer === o) ?? options[0]!)[0];
	}

	async function yes(question: string, def: boolean): Promise<boolean> {
		const a = await ask(`${question} (y/n)`, def ? 'y' : 'n', (v) => (/^(y|yes|n|no)$/i.test(v) ? null : 'answer y or n'));
		return /^y/i.test(a);
	}

	/** Read lines until an empty one (or the end of input). Returns '' when not interactive. */
	async function readBlock(prompt: string): Promise<string> {
		if (!rl) return '';
		const lines: string[] = [];
		for (;;) {
			let line: string;
			try {
				line = await readLine(lines.length ? '' : prompt);
			} catch {
				break;
			}
			if (line.trim() === '') break;
			lines.push(line);
		}
		return lines.join('\n');
	}

	return { interactive: rl !== null, say, ask, choose, yes, readBlock, close: () => rl?.close() };
}

/** `--name value` style options and `--flag` switches. */
export function parseArgs(argv: string[]) {
	return {
		flag: (name: string) => argv.includes(`--${name}`),
		option: (name: string) => {
			const i = argv.indexOf(`--${name}`);
			return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : undefined;
		},
	};
}
