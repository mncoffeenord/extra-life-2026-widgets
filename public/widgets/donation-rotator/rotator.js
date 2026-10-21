// @ts-check
import { amountLabel, donorLabel } from '../../shared/format.js';
import { connectLive } from '../../shared/live.js';
import { DonationRotation } from '../../shared/rotation.js';

const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
// The "with messages" page (/widgets/donation-messages) reuses this script with <body data-messages="on">.
const showMessages = document.body.dataset.messages === 'on';
const rotation = new DonationRotation({ ownParticipantId: null });

let intervalMs = 45_000;
let unknownDonorName = 'Mysterious Hero';
let privateAmountText = 'Private donation';
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;
let started = false;
/** @type {string | null} */
let currentId = null;

const live = connectLive((s) => {
	rotation.setOwnParticipantId(s.ownParticipantId);
	intervalMs = s.rotation.intervalMs;
	unknownDonorName = s.rotation.unknownDonorName;
	privateAmountText = s.rotation.privateAmountText;
	const fresh = rotation.update(s.donations.participant, s.donations.team);
	// Start on the first snapshot; after that, a new donation interrupts the rotation right away.
	if (!started || fresh.length > 0) {
		started = true;
		advance();
	}
});

function advance() {
	clearTimeout(timer);
	const item = rotation.next();
	if (!item || item.donation.id !== currentId || item.isNew) show(item);
	timer = setTimeout(advance, intervalMs);
}

/** @param {import('../../shared/rotation.js').RotationItem | null} item */
function show(item) {
	currentId = item?.donation.id ?? null;
	const slide = item ? donationSlide(item) : emptySlide();
	for (const old of stage.querySelectorAll('.slide')) {
		old.classList.replace('in', 'out');
		setTimeout(() => old.remove(), 600);
	}
	stage.append(slide);
	requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('in')));
	void fitMessage(slide);
}

/**
 * Long messages: try the normal size (3 lines), then one step smaller, then scroll slowly upward during the
 * donation's turn (hold at the start, scroll at about half a line per second, hold at the end). No text is cut.
 * @param {HTMLElement} slide
 */
async function fitMessage(slide) {
	const box = /** @type {HTMLElement | null} */ (slide.querySelector('.msg'));
	const text = /** @type {HTMLElement | null} */ (box?.querySelector('.msg-text') ?? null);
	if (!box || !text) return;
	await document.fonts.ready;
	const overflow = () => text.scrollHeight - box.clientHeight;
	if (overflow() > 1) slide.classList.add('msg-small');
	const distance = overflow();
	if (distance <= 1) return;
	slide.classList.add('msg-scroll');
	const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 15;
	const holdStart = 4000;
	const holdEnd = 3000;
	// half a line per second, but always finish within the donation's turn
	const scroll = Math.min((distance / (lineHeight * 0.5)) * 1000, Math.max(2000, intervalMs - holdStart - holdEnd - 2000));
	const total = holdStart + scroll + holdEnd;
	text.animate(
		[
			{ transform: 'translateY(0)', offset: 0 },
			{ transform: 'translateY(0)', offset: holdStart / total },
			{ transform: `translateY(${-distance}px)`, offset: (holdStart + scroll) / total },
			{ transform: `translateY(${-distance}px)`, offset: 1 },
		],
		{ duration: total, easing: 'linear', fill: 'forwards' },
	);
}

/** @param {import('../../shared/rotation.js').RotationItem} item */
function donationSlide({ donation, source, isNew }) {
	const slide = el('div', `slide${isNew ? ' alert' : ''}`);
	const line1 = el('div', 'line1');
	line1.append(el('span', 'donor', donorLabel(donation, unknownDonorName)));
	const hasAmount = typeof donation.amount === 'number';
	line1.append(el('span', `amount${hasAmount ? '' : ' private'}`, amountLabel(donation, privateAmountText)));

	let msg = null;
	if (showMessages && donation.message) {
		slide.classList.add('has-msg');
		msg = el('div', 'msg');
		msg.append(el('div', 'msg-text', `\u201C${donation.message.trim()}\u201D`));
	}

	const line2 = el('div', 'line2');
	line2.append(el('span', source === 'mine' ? 'pill blue' : 'pill yellow', source === 'mine' ? 'My page' : 'Team'));
	const parts = [];
	if (source === 'team' && donation.recipientName && donation.recipientName !== donation.donorName) parts.push(`for ${donation.recipientName}`);
	parts.push(timeAgo(Date.parse(donation.createdAt)));
	line2.append(el('span', 'meta', parts.join(' · ')));

	slide.append(...(msg ? [line1, msg, line2] : [line1, line2]));
	return slide;
}

function emptySlide() {
	return el('div', 'slide empty', 'Be the first to donate!');
}

/**
 * Text is always set with textContent: donor names and messages are untrusted.
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 */
function el(tag, className, text) {
	const node = document.createElement(tag);
	node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

/** @param {number} ms */
function timeAgo(ms) {
	const s = Math.max(0, (live.now() - ms) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}
