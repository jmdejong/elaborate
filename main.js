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
		this.water = 0;
		this.lake = 0;
		this.sediment = 0;
		this.drain = null;
	}
}


class NodeGraph {
	constructor(seed, size, nodeSize, nodeRandomness) {
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
				let off = vec2(Math.cos(a), Math.sin(a)).mult((1-r*r)*nodeRandomness/2);
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

	drain(node) {
		if (node.drain) {
			return this.getNode(node.drain);
		} else {
			console.error("no drain found", node);
			return null;
		}
	}

	all() {
		return this.nodes.values();
	}

	reset() {
		for (let node of this.nodes.values()) {
			node.reset();
		}
	}

	draw(id, features, colorMax) {
		let colors = [[0, 0.5, 0], [0.0, 0.9, 0.0], [0.5, 0.9, 0.1], [0.9, 0.85, 0.2], [0.8, 0.6, 0.0], [0.9, 0.2, 0], [1, 0, 0], [0.75, 0, 0], [0.5, 0, 0], [0.25, 0, 0], [0, 0, 0]];
		let colorscale = colors.length / colorMax;
		function color(height) {
			let h = clamp(height * colorscale, 0, colors.length -1);
			let prev = colors[Math.floor(h)];
			let next = colors[Math.ceil(h)];
			let dh = h-Math.floor(h);
			return [0, 1, 2].map(i => prev[i] * (1-dh) + next[i] * dh);
		}
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
					let [r, g, b] = color(node.height).map(c => c*255);
					let col = `rgb(${r}, ${g}, ${b})`;
					display.circle(node.pos, this.ns / 2, col);
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
					let drain = this.drain(node);
					display.line(node.pos, drain.pos, "#22f", clamp(Math.sqrt(node.water)/5, 0.5, 5));
				}
			}
		}
	}
}

class World {

	constructor(graph) {
		this.graph = graph;
		this.sediment = {created: 0, deposited: 0, lost: 0};
	}

	heighten(amplitude, featureSize, base, edge) {
		let noise = new FastNoiseLite(this.graph.seed);
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(1/featureSize);
		for (let node of this.graph.all()) {
			node.height += noise.GetNoise(node.pos.x, node.pos.y) * amplitude + base;
		}
	}

	cutEdge(baseHeight, distance, additive, parabolic) {
		if (distance <= 0) {
			return;
		}
		for (let node of this.graph.all()) {
			let dx = Math.min(node.pos.x, this.graph.size.x - node.pos.x, distance)/distance;
			let dy = Math.min(node.pos.y, this.graph.size.y - node.pos.y, distance)/distance;
			let d = dx * dy;
			if (parabolic) {
				let d_ = 1-d;
				d = 1 -  d_ * d_;
			}
			node.height = node.height*(additive ? 1 : d) + baseHeight * (1-d);
		}
	}

	land(plainsSlope, lakeAmount, lakeSize) {
		let noise = new FastNoiseLite(hash(this.graph.seed^23790));
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(1/lakeSize);
		let fringe = new PriorityFringe(hash(this.graph.seed ^ 2245));
		let visited = new Set();
		let sorted = [];
		for (let node of this.graph.sinks()) {
			fringe.put(node);
			visited.add(node.id.hash());
		}
		while (!fringe.isEmpty()) {
			let node = fringe.take();
			sorted.push(node);
			for (let neighbour of this.graph.neighbours(node)) {
				if (!visited.has(neighbour.id.hash())) {
					if (neighbour.height < node.height) {
						let l = noise.GetNoise(neighbour.pos.x, neighbour.pos.y) + 1 - lakeAmount;
						if (l < 0) {
							neighbour.lake = l*(node.height - neighbour.height);
							neighbour.height = node.height+1e-6;
						} else {
							neighbour.height = node.height + randf(neighbour.id, 3627) * plainsSlope / (node.height - neighbour.height + 1);
						}
					}
					if (!neighbour.isSink()) {
						neighbour.drain = node.id;
					}
					fringe.put(neighbour);
					visited.add(neighbour.id.hash());
				}
			}
		}
		return sorted;
	}

	drain(nodes, rainfall) {
		let wetness = rainfall *this.graph.ns*this.graph.ns;
		for (let i=nodes.length; i--;) {
			let node = nodes[i];
			if (node.isSink()) {
				continue;
			}
			node.water += wetness;
			let drain = this.graph.drain(node);
			drain.water += node.water;
		}
	}

	erode(nodes, amount, fjords) {
		for (let node of nodes) {
			if (node.isSink()) {
				continue;
			}
			let drain = this.graph.drain(node)
			let dh = (node.height - drain.height);
			let water = drain.isSink() ? 1 : drain.isSea() ? Math.pow(drain.water, fjords) : drain.water;
			let erosion = Math.sqrt(water) * amount / this.graph.ns;
			let newHeight = Math.min(drain.height + dh / Math.max(1,erosion), node.height);
			let eroded = node.height - newHeight;
			node.height -= eroded;
			this.sediment.created += eroded;
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
				this.sediment.lost += node.sediment;
				continue;
			}
			let deposited = node.sediment * amount / node.water;
			node.sediment -= deposited;
			node.height += deposited;
			this.sediment.deposited += deposited;

			let sediment = node.sediment;
			let drain = this.graph.drain(node);
			drain.sediment += sediment;
		}
	}
}



function generate(settings) {
	console.log("  start generating", settings);
	let startTime = Date.now();
	let size = settings.size;
	let graph = time("initialize graph", () => new NodeGraph(settings.seed, vec2(size, size), settings.nodeSize || 8, settings.nodeRandomness));
	let world = new World(graph);
	time("heighten", () => world.heighten(settings.amplitude, settings.featureSize, settings.baseHeight));
	time("cut edge", () => world.cutEdge(settings.edgeHeight, size * 0.005 * settings.edgePercentage, settings.edgeMode == "add", settings.edgeShape == "parabole"));
	let erosionStep = settings.erosionStep;
	let erosionScale = (Math.pow(erosionStep, settings.iterations)-1)/(erosionStep-1);
	for (let i=0; i<settings.iterations; ++i) {
		graph.reset();
		let sorted = time("land", () => world.land(settings.plainsSlope, settings.lakeAmount, settings.lakeSize));
		time("drain", () => world.drain(sorted, settings.rainfall));
		if (i === 0) {
			if (settings.drawPartial) {
				time("draw partial", () => graph.draw("partial", settings.draw, settings.colorMax));
			} else {
				document.getElementById("partial").hidden = true;
			}
		}
		let erosion = settings.erosion * Math.pow(erosionStep, i) / erosionScale;
		time("erode", () => world.erode(sorted, erosion, settings.fjords));
		time("depose", () => world.depose(sorted, settings.deposition, settings.depositionSpread));

	}
	time("draw", () => graph.draw(null, settings.draw, settings.colorMax));
	console.log(`sediment created: ${world.sediment.created / 1e6}, sediment deposited: ${world.sediment.deposited/1e6}, sediment lost: ${world.sediment.lost/1e6}, balance: ${(world.sediment.created - world.sediment.deposited - world.sediment.lost)/1e6}`);
	let endTime = Date.now();
	console.log("  generate done", (endTime - startTime) / 1000);
	window.world = world;
	document.getElementById("currentsettings").textContent = JSON.stringify(settings, null, 2);
}

function readSettings(form) {
	function n(input) {
		if (input.type === "number") {
			return +(input.value || input.defaultValue);
		} else if (input.type === "checkbox") {
			return input.checked;
		} else if (input.type === "select-one") {
			return input.value;
		} else {
			console.error(`unknown input type '${input.type}'`, input);
		}
	}
	let settings = {};
	for (let input of form) {
		if (input.name) {
			let parts = input.name.split(".");
			let obj = settings;
			while (parts.length > 1) {
				let head = parts.shift();
				if (obj[head] === undefined) {
					obj[head] = {};
				}
				obj = obj[head];
			}
			let name = parts[0];
			obj[name] = n(input);
		}
	}
	if (!settings.seed) {
		settings.seed = Math.random() * 1e7 | 0;
	}
	return settings;
}

function main() {
	let form = document.getElementById("settings");
	form.addEventListener("submit", e => generate(readSettings(e.target.elements)));
	generate(readSettings(form.elements));
}

window.addEventListener("load", main);
