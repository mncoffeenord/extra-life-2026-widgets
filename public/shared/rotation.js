// @ts-check
// Donation rotator logic (pure, no DOM), modeled on the 2022 tracker's two widgets:
//  - "last donation": newly arrived donations are queued and shown first, oldest arrival first.
//  - "donation rotation": otherwise cycle through recent donations forever.
// Here the cycle alternates round-robin between the streamer's own donations and the rest of the team's.
// Unlike 2022 (which compared array lengths and stalled once the API's 100-item cap was hit),
// new donations are detected by donationID.

/**
 * @typedef {{ id: string, donorName: string | null, amount: number | null, createdAt: string,
 *   participantId: number | null, recipientName: string | null, message?: string | null }} Donation
 * @typedef {'mine' | 'team'} Source
 * @typedef {{ donation: Donation, source: Source, isNew: boolean }} RotationItem
 */

export class DonationRotation {
	/** @type {Donation[]} */ #mine = [];
	/** @type {Donation[]} */ #team = [];
	/** @type {RotationItem[]} */ #alerts = [];
	/** @type {Set<string> | null} */ #seen = null;
	/** @type {Record<Source, number>} */ #cursor = { mine: 0, team: 0 };
	/** @type {Source} */ #nextSource = 'mine';
	#ownParticipantId;

	/** @param {{ ownParticipantId: number | null }} opts */
	constructor({ ownParticipantId }) {
		this.#ownParticipantId = ownParticipantId;
	}

	/** @param {number | null} id */
	setOwnParticipantId(id) {
		this.#ownParticipantId = id;
	}

	/**
	 * Feed the latest lists (newest first). Returns donations that are new since the previous update.
	 * The very first update only sets the baseline, so a page reload does not replay old donations as alerts.
	 * @param {Donation[]} mine
	 * @param {Donation[]} team
	 * @returns {RotationItem[]}
	 */
	update(mine, team) {
		const own = this.#ownParticipantId;
		const mineIds = new Set(mine.map((d) => d.id));
		this.#mine = mine.slice();
		// The team feed includes the streamer's own donations; show those only in the "mine" slot.
		this.#team = team.filter((d) => !mineIds.has(d.id) && (own === null || d.participantId !== own));

		const all = [
			...this.#mine.map((d) => /** @type {RotationItem} */ ({ donation: d, source: 'mine', isNew: true })),
			...this.#team.map((d) => /** @type {RotationItem} */ ({ donation: d, source: 'team', isNew: true })),
		];
		/** @type {RotationItem[]} */
		let fresh = [];
		if (this.#seen === null) {
			this.#seen = new Set();
		} else {
			const seen = this.#seen;
			fresh = all.filter((item) => !seen.has(item.donation.id)).sort((a, b) => a.donation.createdAt.localeCompare(b.donation.createdAt));
			this.#alerts.push(...fresh);
		}
		for (const item of all) this.#seen.add(item.donation.id);

		this.#cursor.mine = this.#mine.length ? this.#cursor.mine % this.#mine.length : 0;
		this.#cursor.team = this.#team.length ? this.#cursor.team % this.#team.length : 0;
		return fresh;
	}

	get isEmpty() {
		return this.#mine.length === 0 && this.#team.length === 0 && this.#alerts.length === 0;
	}

	/** @returns {RotationItem | null} */
	next() {
		const alert = this.#alerts.shift();
		if (alert) return alert;

		/** @type {Source[]} */
		const order = this.#nextSource === 'mine' ? ['mine', 'team'] : ['team', 'mine'];
		for (const source of order) {
			const list = source === 'mine' ? this.#mine : this.#team;
			if (list.length === 0) continue;
			const donation = /** @type {Donation} */ (list[this.#cursor[source] % list.length]);
			this.#cursor[source] = (this.#cursor[source] + 1) % list.length;
			this.#nextSource = source === 'mine' ? 'team' : 'mine';
			return { donation, source, isNew: false };
		}
		return null;
	}
}
