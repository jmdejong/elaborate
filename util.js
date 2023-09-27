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
