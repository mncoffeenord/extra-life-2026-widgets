// Donor messages go on stream unmoderated, so the server hides messages that match a word list.
// A flagged donation still shows (name and amount); only its message is removed before any widget sees it.
//
// Matching is per word (so "class" or "Dickens" never match), case-insensitive, and tolerant of common
// evasions: leetspeak (sh1t), stretched letters (fuuuck), accents, and simple endings (-s, -ed, -ing...).
// It is a safety net, not a moderation system: spaced-out letters ("f u c k") or new slang get through.

import type { Donation } from './extralife/parse.ts';

/** Starter list. Extend it with messageFilter.extraWords in config.json. */
export const DEFAULT_BLOCKED_WORDS = [
	'fuck', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole', 'dick', 'dickhead', 'cock', 'pussy',
	'bastard', 'whore', 'slut', 'twat', 'wanker', 'prick', 'jackass', 'dumbass', 'douche', 'douchebag',
	'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'kike', 'spic', 'chink', 'tranny', 'dyke',
	'rape', 'rapist', 'nazi', 'kys',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };
const SUFFIXES = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'in', 'y'];

/** Lowercase, strip accents, undo leetspeak, and squeeze repeated letters ("fuuuck" and "fuck" both become "fuck"). */
export function normalizeWord(word: string): string {
	const plain = word
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[013457@$!]/g, (c) => LEET[c] ?? c);
	return plain.replace(/(.)\1+/g, '$1');
}

export function createMessageFilter(words: string[]): (message: string) => boolean {
	const blocked = new Set(words.map(normalizeWord).filter(Boolean));
	return (message: string) => {
		// Split on anything that is not a letter, digit, or leet character, so "sh1t" stays one token.
		for (const raw of message.split(/[^\p{L}\p{N}@$!]+/u)) {
			// Trailing "!!!" is punctuation, not leetspeak for "iii".
			const word = raw.replace(/!+$/, '');
			if (!word) continue;
			const token = normalizeWord(word).replace(/[^\p{L}]/gu, '');
			for (const suffix of SUFFIXES) {
				if (token.endsWith(suffix) && blocked.has(token.slice(0, token.length - suffix.length))) return true;
			}
		}
		return false;
	};
}

/** Remove flagged messages. Returns the same donations with message set to null where flagged. */
export function hideFlaggedMessages(donations: Donation[], isFlagged: (message: string) => boolean): Donation[] {
	return donations.map((d) => (d.message && isFlagged(d.message) ? { ...d, message: null } : d));
}
