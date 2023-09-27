"use strict";

const TRIHEIGHT = 0.866;

class Node {
	constructor(id, pos) {
		this.id = id;
		this.pos = pos;
		this.drain = null;
		this.water = 0;
		this.height = 0;
	}

	neighbours() {
		return [vec2(this.id.x + 1, this.id.y), vec2(this.id.x - 1, this.id.y), vec2(this.id.x, this.id.y + 1), vec2(this.id.x, this.id.y - 1)];
	}

	isSea() {
		return this.height < 0;
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
				let a = randf(nv, 930 * this.seed)*2*Math.PI;
				let r = randf(nv, 872 * this.seed);
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

	getNode(id) {
		return this.nodes.get(id.hash());
	}

	edges() {
		let edges = [];
		for (let x=this._leftX(this._topY); x<=this._rightX(this._topY); ++x) {
			edges.push(this.getNode(vec2(x, this._topY)));
		}
		for (let x=this._leftX(this._bottomY); x<=this._rightX(this._bottomY); ++x) {
			edges.push(this.getNode(vec2(x, this._bottomY)));
		}
		for (let y=this._topY + 1; y<this._bottomY; ++y) {
			edges.push(this.getNode(vec2(this._leftX(y), y)));
			edges.push(this.getNode(vec2(this._rightX(y), y)));
		}
		return edges.filter(e => e);
	}

	neighbours(node) {
		return [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1), vec2(1, -1), vec2(-1, 1)]
			.map(v => {
				return this.getNode(v.add(node.id))
			})
			.filter(v => v);
	}

	heighten(amplitude, frequency, base, edge) {
		let noise = new FastNoiseLite(this.seed);
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(frequency);
		for (let node of this.nodes.values()) {
			node.height += noise.GetNoise(node.pos.x, node.pos.y) * amplitude + base
			// let d = Math.min(Math.min(node.pos.x, this.size.x - node.pos.x), Math.min(node.pos.y, this.size.y - node.pos.y));
			// if (d < edge) {
			// 	node.height = -0.5 + (0.5 + node.height) * d / edge;
			// }
		}
	}

	cutEdge(baseHeight, distance) {
		for (let node of this.nodes.values()) {
			let d = Math.min(node.pos.x, this.size.x - node.pos.x, node.pos.y, this.size.y - node.pos.y, distance)/distance;
			node.height = baseHeight + (node.height - baseHeight) * d;
		}
		for (let node of this.edges()) {
			node.height = baseHeight;
		}
	}


	land() {
		let fringe = new PriorityFringe(hash(this.seed ^ 2245));
		let visited = new Set();
		for (let node of this.edges()) {
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
					if (!neighbour.isSea()) {
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
			while (!node.isSea()) {
				node.water += wetness;
				node = this.getNode(node.drain);
			}
		}
	}

	erode(amount, shore) {
		let nodes = Array.from(this.nodes.values()).filter(node => !node.isSea())
		nodes.sort((a, b) => a.height - b.height);

		for (let node of nodes) {
			let drain = this.getNode(node.drain);
			let dh = (node.height - drain.height);
			let water = drain.isSea() ? shore : drain.water;
			let erosion = Math.sqrt(water) * amount / this.ns;
			node.height = drain.height + dh / Math.max(erosion, 1);
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
			if (node.isSea()) {
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
			if (node.isSea()) {
				for (let neighbour of this.neighbours(node)) {
					if (neighbour && neighbour.isSea()) {
						display.line(node.pos, neighbour.pos, "#008", this.ns/2);
					}
				}
			} else {
				if (node.water < 1) {
					continue;
				}
				let drain = this.getNode(node.drain);
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
	let size = 940;
	let world = time("world", () => new World(vec2(size, size), 16, seed));
	time("heighten", () => world.heighten(1, 0.003, 0.5));
	time("cut edge", () => world.cutEdge(-0.5, size / 4));
	time("land", () => world.land());
	time("drain", () => world.drain(0.005));
	time("draw", () => world.draw("partial"));
	time("erode", () => world.erode(16.0, 10));
	time("draw", () => world.draw());
	window.world = world;
}
window.addEventListener("load", main);
