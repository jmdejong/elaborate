"use strict";

const TRIHEIGHT = 0.866;

class Node {
	constructor(id, pos) {
		this.id = id;
		this.pos = pos;
		this.height = 0;
		this.sink = false;
		this.reset();
	}

	neighbours() {
		return [vec2(this.id.x + 1, this.id.y), vec2(this.id.x - 1, this.id.y), vec2(this.id.x, this.id.y + 1), vec2(this.id.x, this.id.y - 1)];
	}

	isSea() {
		return this.height < 0 || this.isSink();
	}

	isSink() {
		return this.sink;
	}

	reset() {
		this.drain = null;
		this.water = 0;
		this.lake = 0;
		this.sediment = 0;
		this.speed = 0;
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
		for (let node of this.sinks()) {
			node.sink = true;
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

	sinks() {
		let sinks = [];
		for (let x=this._leftX(this._topY); x<=this._rightX(this._topY); ++x) {
			sinks.push(this.getNode(vec2(x, this._topY)));
		}
		for (let x=this._leftX(this._bottomY); x<=this._rightX(this._bottomY); ++x) {
			sinks.push(this.getNode(vec2(x, this._bottomY)));
		}
		for (let y=this._topY + 1; y<this._bottomY; ++y) {
			sinks.push(this.getNode(vec2(this._leftX(y), y)));
			sinks.push(this.getNode(vec2(this._rightX(y), y)));
		}
		return sinks.filter(e => e);
	}

	neighbours(node) {
		return [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1), vec2(1, -1), vec2(-1, 1)]
			.map(v => this.getNode(v.add(node.id)))
			.filter(v => v);
	}

	heighten(amplitude, frequency, base, edge) {
		let noise = new FastNoiseLite(this.seed);
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(frequency);
		for (let node of this.nodes.values()) {
			node.height += noise.GetNoise(node.pos.x, node.pos.y) * amplitude + base;
		}
	}

	cutEdge(baseHeight, distance, additive, parabolic) {
		for (let node of this.nodes.values()) {
			let dx = Math.min(node.pos.x, this.size.x - node.pos.x, distance)/distance;
			let dy = Math.min(node.pos.y, this.size.y - node.pos.y, distance)/distance;
			let d = dx * dy;
			if (parabolic) {
				let d_ = 1-d;
				d = 1 -  d_ * d_;
			}
			node.height = node.height*(additive ? 1 : d) + baseHeight * (1-d);
		}
	}

	reset() {
		for (let node of this.nodes.values()) {
			node.reset();
		}
	}

	land(lakeAmount, lakeSize) {
		let noise = new FastNoiseLite(hash(this.seed^23790));
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(1/lakeSize);
		let fringe = new PriorityFringe(hash(this.seed ^ 2245));
		let visited = new Set();
		let sorted = [];
		for (let node of this.sinks()) {
			fringe.put(node);
			visited.add(node.id.hash());
		}
		while (!fringe.isEmpty()) {
			let node = fringe.take();
			sorted.push(node);
			for (let neighbour of this.neighbours(node)) {
				if (!visited.has(neighbour.id.hash())) {
					if (neighbour.height < node.height) {
						let l = noise.GetNoise(neighbour.pos.x, neighbour.pos.y) + 1 - lakeAmount;
						if (l < 0) {
							neighbour.lake = l*(node.height - neighbour.height);
							neighbour.height = node.height+1e-6;
						} else {
							neighbour.height = node.height + randf(neighbour.id, 3627) * 0.001;
						}
					}
					if (!neighbour.isSink()){
						neighbour.drain = node.id;
					}
					fringe.put(neighbour);
					visited.add(neighbour.id.hash());
				}
			}
		}
		return sorted;
	}

	drain(nodes, w) {
		let wetness = w *this.ns*this.ns
		for (let i=nodes.length; i--;) {
			let node = nodes[i];
			if (node.isSink()) {
				continue;
			}
			node.water += wetness;
			let drain = this.getNode(node.drain);
			drain.water += node.water;
			node.speed += node.height - drain.height;
			drain.speed += 0.9 * node.speed;
		}
	}

	erode(nodes, amount, fjords) {
		for (let node of nodes) {
			if (node.isSink()) {
				continue;
			}
			let drain = this.getNode(node.drain);
			let dh = (node.height - drain.height);
			let water = drain.isSink() ? 1 : drain.isSea() ? Math.pow(drain.water, fjords) : drain.water;
			let erosion = Math.sqrt(water) * amount / this.ns;
			let newHeight = drain.height + dh / Math.max(erosion, 1);
			let eroded = node.height - newHeight;
			node.height = newHeight;
			drain.sediment += eroded;
		}
	}

	depose(nodes, amount, spread) {
		if (amount <= 0) {
			return;
		}
		for (let i=nodes.length; i--;) {
			let node = nodes[i];
			if (node.isSink()) {
				continue;
			}
			let deposited = node.sediment/node.water * amount;
			node.sediment -= deposited;
			node.height += deposited;
			let sediment = node.sediment;
			let drain = this.getNode(node.drain);
			drain.sediment += sediment * (1-spread);
			sediment *= spread;
			let neighbours = this.neighbours(node);
			for (let neighbour of this.neighbours(node)) {
				neighbours.sediment += sediment / neighbours.length;
			}
		}
	}

	draw(id, features, colorscale) {
		let colors = [[0, 0.5, 0], [0.0, 0.9, 0.0], [0.5, 0.9, 0.1], [0.9, 0.85, 0.2], [0.8, 0.6, 0.0], [0.9, 0.2, 0], [1, 0, 0], [0.75, 0, 0], [0.5, 0, 0], [0.25, 0, 0], [0, 0, 0]];
		if (!id) {
			id = "worldlevel";
		}
		let canvas = document.getElementById(id);
		canvas.hidden = false;
		canvas.width = this.size.x;
		canvas.height = this.size.y;
		let display = new Display(canvas)
		if (features.circles) {
			for (let node of this.nodes.values()) {
				if (node.isSea()) {
					display.circle(node.pos, this.ns *0.65, "#00a");
				} else if (node.lake) {
					display.circle(node.pos, this.ns *0.65, "#00f");
				} else {
					let h = clamp(node.height * colorscale, 0, colors.length -1);
					let prev = colors[Math.floor(h)];
					let next = colors[Math.ceil(h)];
					let dh = h-Math.floor(h);
					let r = prev[0] * (1-dh) + next[0] * dh;
					let g = prev[1] * (1-dh) + next[1] * dh;
					let b = prev[2] * (1-dh) + next[2] * dh;
					let color = `rgb(${r*255}, ${g*255}, ${b*255})`;
					display.circle(node.pos, this.ns / 2, color);
				}
			}
		}
		if (features.rivers) {
			for (let node of this.nodes.values()) {
				if (node.isSea()) {/*
					for (let neighbour of this.neighbours(node)) {
						if (neighbour && neighbour.isSea()) {
							display.line(node.pos, neighbour.pos, "#008", this.ns/2);
						}
					}*/
				} else {
					if (node.water < 1.1) {
						continue;
					}
					let drain = this.getNode(node.drain);
					display.line(node.pos, drain.pos, "#22f", clamp(Math.sqrt(node.water)/5, 0.5, 5));
				}
			}
		}
	}
}



function generate(settings) {
	let seed = settings.seed;
	let size = settings.size;
	console.log("  start generating", settings);
	let world = time("world", () => new World(vec2(size, size), settings.nodeSize || 8, seed));
	time("heighten", () => world.heighten(settings.amplitude, settings.frequency, settings.baseHeight));
	time("cut edge", () => world.cutEdge(settings.edgeHeight, size * 0.005 * settings.edgePercentage, settings.edgeMode == "add", settings.edgeShape == "parabole"));
	for (let i=0; i<settings.iterations; ++i) {
		world.reset();
		let sorted = time("land", () => world.land(settings.lakeAmount, settings.lakeSize));
		time("drain", () => world.drain(sorted, settings.wetness));
		if (i === 0) {
			if (settings.drawPartial) {
				time("draw partial", () => world.draw("partial", settings.drawFeatures, settings.colorscale));
			} else {
				document.getElementById("partial").hidden = true;
			}
		}
		time("erode", () => world.erode(sorted, settings.erosion, settings.fjords));
		time("depose", () => world.depose(sorted, settings.deposition, settings.depositionSpread));
	}
	time("draw", () => world.draw(null, settings.drawFeatures, settings.colorscale));
	console.log("  generate done")
	window.world = world;
	document.getElementById("currentsettings").textContent = JSON.stringify(settings, null, 2);
}



function readSettings(form) {
	function n(input) {
		return +(input.value || input.defaultValue);
	}
	return {
		seed: +(form.seed.value || Math.random() * 1e6 | 0),
		size: n(form.size),
		nodeSize: n(form.nodesize),
		amplitude: n(form.amplitude),
		frequency: n(form.frequency),
		baseHeight: n(form.baseheight),
		edgeHeight: n(form.edgeheight),
		edgePercentage: n(form.edgepercentage),
		edgeMode: form.edgemode.value,
		edgeShape: form.edgeshape.value,
		lakeAmount: n(form.lakeamount),
		lakeSize: n(form.lakesize),
		wetness: n(form.wetness),
		drawPartial: form.drawpartial.checked,
		erosion: n(form.erosion),
		fjords: n(form.fjords),
		deposition: n(form.deposition),
		depositionSpread: n(form.depositionspread),
		iterations: n(form.iterations),
		drawFeatures: {
			rivers: form.drawrivers.checked,
			circles: form.drawcircles.checked
		},
		colorscale: n(form.colorscale)
	};
}

function main() {
	let form = document.getElementById("settings");
	form.addEventListener("submit", e => generate(readSettings(e.target.elements)));
	generate(readSettings(form.elements));
}

window.addEventListener("load", main);
