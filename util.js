"use strict";



function clamp(v, min, max) {
	return Math.min(Math.max(v, min), max);
}

function hash(num) {
	num ^= num << 13;
	num ^= num >> 17;
	num ^= num << 5;
	return (num * 0x4f6cdd1d) | 0;
}


function time(description, fn) {
	let startTime = Date.now();
	let ret = fn();
	let endTime = Date.now();
	console.log(description, (endTime - startTime) / 1000);
	return ret;
}

const M = 1<<30

function randf(pos, seed) {
	let r = hash(pos.y*7 ^ hash(pos.x * 11 ^ hash(seed)));
	return Math.abs((r % M)/M);
}

function scaleExp(n, growth) {
	if (n === 0 || growth === 0) {
		return 1;
	}
	let total = 0;
	for (let i=0; i<n; ++i) {
		total += Math.pow(growth, i);
	}
	return 1/total;
}


class PriorityFringe {
	constructor(keyfn) {
		this.items = new PriorityQueue(keyfn);
	}
	put(item) {
		this.items.add(item);
	}
	take() {
		return this.items.remove()
	}
	isEmpty() {
		return this.items.heap.length === 0;
	}

	forEach(fn) {
		this.items.heap.forEach(fn);
	}
}
class RandomFringe {
	constructor(seed) {
		this.seed = seed;
		this.items = [];
	}
	put(item) {
		this.items.push(item);
	}
	take() {
		this.seed = hash(this.seed);
		let ind = Math.abs(this.seed) % this.items.length;
		let last = this.items.pop();
		if (ind === this.items.length) {
			return last;
		} else {
			let item = this.items[ind];
			this.items[ind] = last;
			return item;
		}
	}
	isEmpty() {
		return this.items.length === 0;
	}

	forEach(fn) {
		this.items.forEach(fn);
	}
}
