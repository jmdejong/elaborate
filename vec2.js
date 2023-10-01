"use strict";

class Vec2 {

	constructor(x, y) {
		this.x = x;
		this.y = y;
	}

	hash() {
		// return this.x + "," + this.y;
		return this.x + (1<<15) | (this.y + (1<<15)) <<16;
	}

	surface() {
		return this.x * this.y;
	}

	length() {
		return Math.hypot(this.x, this.y);
	}

	normalize() {
		return this.mult(1/this.length());
	}

	mult(n) {
		return vec2(this.x * n, this.y * n);
	}

	add(v) {
		return vec2(this.x + v.x, this.y + v.y);
	}

	sub(v) {
		return vec2(this.x - v.x, this.y - v.y);
	}

	toUint() {
		return this.x | (this.y << 16);
	}

	clone() {
		return vec2(this.x, this.y);
	}



	diamond() {
		if (Math.abs(this.x) + Math.abs(this.y) > 1) {
			let v = this.clone();
			v.x += this.x > 0 ? -1 : 1;
			v.y += this.y > 0 ? -1 : 1;
			return v;
		} else {
			return this.clone();
		}
	}
}

Vec2.fromUint = function Vec2FromUint(uint) {
	return new Vec2(uint & 0xffff, uint >> 16);
}

// Vec2.unHash = function Vec2UnHash(str) {
// 	let [x, y] = str.split(",").map(i => i | 0)
// 	return new Vec2(x, y);
// }

Vec2.rand = function Vec2Rand() {
	return new Vec2(Math.random() * 2 - 1, Math.random() * 2 - 1);
}

function vec2(x, y) {
	return new Vec2(x, y);
}
