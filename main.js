"use strict";

const TRIHEIGHT = 0.866;

class Node {
	constructor(id, pos) {
		this.id = id;
		this.pos = pos;
		this.drain = null;
		this.sea = 0;
		this.water = 0;
		this.height = 0;
	}

	neighbours() {
		return [vec2(this.id.x + 1, this.id.y), vec2(this.id.x - 1, this.id.y), vec2(this.id.x, this.id.y + 1), vec2(this.id.x, this.id.y - 1)];
	}
}

class PriorityFringe {
	constructor() {
		this.items = new PriorityQueue(node => node.height);
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


class World {
	constructor(size, nodeSize, seed) {
		this.size = size;
		this.seed = seed;
		this.nodes = new Map();
		this.ns = nodeSize;
		this.nodedim = this.size.mult(1/this.ns);
		this._topY = 0
		this._bottomY = Math.ceil(this.nodedim.y/TRIHEIGHT)

		for (let y=this._topY; y<=this._bottomY; ++y) {
			let xo = -y/2|0
			for (let x=this._leftX(y); x<=this._rightX(y); ++x) {
				let nv = vec2(x, y);
				let a = randf(nv, 930)*2*Math.PI;
				let r = randf(nv, 872);
				let off = vec2(Math.cos(a), Math.sin(a)).mult(0.45*(1-r*r));
				let pos = vec2(x + y/2, y*TRIHEIGHT).add(off).mult(this.ns);
				let node = new Node(nv, pos)
				this.nodes.set(nv.hash(), node);
			}
		}
	}

	_leftX(y) {
		return -y/2|0;
	}
	_rightX(y) {
		return this._leftX(y) + this.nodedim.x;
	}

	edges() {
		let edges = [];
		for (let x=this._leftX(this._topY); x<=this._rightX(this._topY); ++x) {
			edges.push(this.nodes.get(vec2(x, this._topY).hash()));
		}
		for (let x=this._leftX(this._bottomY); x<=this._rightX(this._bottomY); ++x) {
			edges.push(this.nodes.get(vec2(x, this._bottomY).hash()));
		}
		for (let y=this._topY + 1; y<this._bottomY; ++y) {
			edges.push(this.nodes.get(vec2(this._leftX(y), y).hash()));
			edges.push(this.nodes.get(vec2(this._rightX(y), y).hash()));
		}
		return edges.filter(e => e);
	}

	neighbours(node) {
		return [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1), vec2(1, -1), vec2(-1, 1)]
			.map(v => {
				return this.nodes.get(v.add(node.id).hash())
			})
			.filter(v => v);
	}

	prepare(frequency, edge) {
		let noise = new FastNoiseLite(this.seed);
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(frequency);
		// let edge = 256;
		for (let node of this.nodes.values()) {//this.nodes.values().forEach(node => {
			node.height = noise.GetNoise(node.pos.x, node.pos.y) + 0.5
			let d = Math.min(Math.min(node.pos.x, this.size.x - node.pos.x), Math.min(node.pos.y, this.size.y - node.pos.y));
			if (d < edge) {
				node.height = -0.5 + (0.5 + node.height) * d / edge;
			}
		}
	}


	land() {
		let fringe = new PriorityFringe(hash(this.seed ^ 2245));
		let visited = new Set();
		for (let node of this.edges()) {
			node.sea = 1;
			fringe.put(node);
			visited.add(node.id.hash());
		}
		while (!fringe.isEmpty()) {
			let node = fringe.take();
			for (let neighbour of this.neighbours(node)) {
				if (!visited.has(neighbour.id.hash())) {
					if (neighbour.height < node.height) {
						neighbour.height = node.height + randf(neighbour.id, 3627) * 0.001;
					} else {
						// neighbour.height -= 0.1 * (neighbour.height - node.height);
					}
					if (neighbour.height < 0) {
						neighbour.sea = 1;
					} else {
						neighbour.drain = node.id;
					}
					fringe.put(neighbour);
					visited.add(neighbour.id.hash());
				}
			}
		}
	}

	drain(w) {
		let wetness = w *this.ns*this.ns
		for (let node of this.nodes.values()) {
			while (!node.sea) {
				node.water += wetness;
				node = this.nodes.get(node.drain.hash());
			}
		}
	}

	draw(id) {
		if (!id) {
			id = "worldlevel";
		}
		let canvas = document.getElementById(id);
		canvas.width = this.size.x;
		canvas.height = this.size.y;
		let display = new Display(canvas)
		for (let node of this.nodes.values()) {
			if (node.sea) {
				display.circle(node.pos, this.ns / 2, "#00a");
			} else {
				let h = node.height*0.8;
				let r = clamp(h*2, 0, 1);
				let g = clamp(Math.min(h+0.8, 1.8 - h*1.5), 0, 1);
				let color = `rgb(${r*255}, ${g*255}, 0)`;
				display.circle(node.pos, this.ns / 2, color);
			}
		}
		for (let node of this.nodes.values()) {
			if (node.sea) {
				for (let neighbour of this.neighbours(node)) {
					// let neighbour = this.nodes.get(v.hash());
					if (neighbour && neighbour.sea) {
						display.line(node.pos, neighbour.pos, "#008", this.ns/2);
					}
				}
			} else {
				if (node.water < 1) {
					continue;
				}
				let drain = this.nodes.get(node.drain.hash());
				display.line(node.pos, drain.pos, "#22f", clamp(Math.sqrt(node.water)/5, 0.5, 5));
			}
		}
	}

	posof(node) {
		return vec2(16 *node.x + (hash(11 + hash(node.x * 13 + hash(node.y * 17+ 531) + 872)) % 7), 16 * node.y + (hash(23 + hash(node.x * 5 +hash(node.y * 7))) % 7));
	}
}



function main() {
	let seed = Math.random() * 1e6 | 0;
	let size = 1024;
	let world = time("world", () => new World(vec2(size, size), 16, seed));
	time("prepare", () => world.prepare(0.005, size / 8));
	time("land", () => world.land());
	time("drain", () => world.drain(0.005));
	time("draw", () => world.draw());
	window.world = world;
}
window.addEventListener("load", main);
