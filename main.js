"use strict";

const TRIHEIGHT = 0.866;

class Node {
	constructor(id, pos, size) {
		this.id = id;
		this.pos = pos;
		this.size = size;
		this.baseHeight = 0;
		this.sink = false;
		this.reset();
	}

	neighbours() {
		return [vec2(this.id.x + 1, this.id.y), vec2(this.id.x - 1, this.id.y), vec2(this.id.x, this.id.y + 1), vec2(this.id.x, this.id.y - 1)];
	}

	isSea() {
		return this.sea || this.isSink();
	}

	isWaterBody() {
		return this.isSea() || this.waterHeight > 0;
	}

	isSink() {
		return this.sink;
	}

	height() {
		return this.baseHeight + this.waterHeight;
	}

	changeGround(ground) {
		this.baseHeight += ground;
	}

	reset() {
		this.water = 0;
		this.waterHeight = 0;
		this.sediment = 0;
		this.drain = null;
		this.drains = [];
		this.sea = false;
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
				let node = new Node(nv, pos, this.ns)
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

	neighbours(node, level) {
		return [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1), vec2(1, -1), vec2(-1, 1)]
			.map(v => this.getNode(v.mult(level).add(node.id)))
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

	drains(node) {
		if (node.isWaterBody()) {
			if (!node.drains.length) {
				console.error("no drains found", node);
				return null;
			}
			return node.drains.map(id  => this.getNode(id));
		} else {
			return [this.drain(node)];
		}
	}

	all() {
		return this.nodes.values();
	}

	reset() {
		for (let node of this.all()) {
			node.reset();
		}
	}

	nearest(pos) {
		let vy = pos.y / this.ns / TRIHEIGHT;
		let vx = pos.x / this.ns - vy / 2;
		let xf = Math.floor(vx);
		let yf = Math.floor(vy);
		let xc = Math.ceil(vx);
		let yc = Math.ceil(vy);
		let candidates = [vec2(xf, yc), vec2(xc, yf)];
		// if (vx + vy >1) {
			candidates.push(vec2(xc, yc));
		// } else {
			candidates.push(vec2(xf, yf));
		// }
		let bestDist = Infinity;
		let best = null;
		for (let candidate of candidates) {
			let node = this.getNode(candidate);
			if (!node) {
				continue;
			}
			let distance = node.pos.sub(pos).length()
			if (distance < bestDist) {
				bestDist = distance
				best = node;
			}
		}
		return best;
	}

	draw(id, settings) {
		let colors = [[0, 0.5, 0], [0.0, 0.9, 0.0], [0.5, 0.9, 0.1], [0.9, 0.85, 0.2], [0.8, 0.6, 0.0], [0.9, 0.2, 0], [1, 0, 0], [0.75, 0, 0], [0.5, 0, 0], [0.25, 0, 0], [0, 0, 0]];
		let colorscale = colors.length / settings.colorMax;
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
		if (settings.drawArea) {
			display.eachPixel(p => {
				let n = this.nearest(p);
				if (n.isSea()) {
					return [0, 0, 0.9];
				} else if (n.isWaterBody()) {
					return [0.3, 0.3, 1];
				} else {
					return color(n.height());
				}
			});
		}
		if (settings.drawCircles) {
			for (let node of this.all()) {
				if (node.isSea()) {
					display.circle(node.pos, node.size *0.65, "#00c");
				} else if (node.isWaterBody()) {
					display.circle(node.pos, node.size *0.65, "#44f");
				} else {
					let [r, g, b] = color(node.height()).map(c => c*255);
					let col = `rgb(${r}, ${g}, ${b})`;
					display.circle(node.pos, node.size * 0.5, col);
				}
			}
		}
		if (settings.drawRivers) {
			for (let node of this.all()) {
				if (node.isSink() || node.water < 1.1 || !settings.drawUnderwaterStreams && node.isWaterBody()) {
					continue;
				}
				for (let drain of this.drains(node)) {
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

	heighten(amplitude, featureSize, base, warpSize, warpEffect) {
		let noise = new Simplex(this.graph.seed, 8, 1/featureSize);
		let xwarp = new Simplex(this.graph.seed ^ 123, 4, 1/warpSize);
		let ywarp = new Simplex(this.graph.seed ^ 321, 4, 1/warpSize);
		for (let node of this.graph.all()) {
			node.changeGround(base + amplitude * noise.noise(node.pos.add(vec2(xwarp.noise(node.pos), ywarp.noise(node.pos)).mult(warpEffect))));
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
			node.baseHeight = node.baseHeight*(additive ? 1 : d) + baseHeight * (1-d);
		}
	}

	land(settings) {
		let noise = new FastNoiseLite(hash(this.graph.seed^23790));
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(1/settings.lakeSize);
		let fringe = new PriorityFringe(node => node.height());
		let visited = new Set();
		let processed = new Set();
		let sorted = [];
		for (let node of this.graph.sinks()) {
			fringe.put(node);
			visited.add(node.id.hash());
			node.waterHeight = Math.max(0, -node.baseHeight);
		}
		while (!fringe.isEmpty()) {
			let node = fringe.take();
			sorted.push(node);
			processed.add(node.id.hash());
			for (let neighbour of this.graph.neighbours(node, 1)) {
				if (!visited.has(neighbour.id.hash())) {
					if (neighbour.height() < node.height()) {
						if (node.isSea()) {
							neighbour.waterHeight = node.height() - neighbour.baseHeight + 1e-6 * randf(neighbour.id, this.graph.seed ^ 4890);
							neighbour.sea = true;
						} else {
							let l = clamp(noise.GetNoise(neighbour.pos.x, neighbour.pos.y) + settings.lakeAmount * 2 - 1, -1, 1);
							if (l > 0) {
								neighbour.waterHeight = l * (node.height() - neighbour.height()) * settings.lakeDepth;
								let totalHeight = node.height() + 1e-6 * randf(neighbour.id, this.graph.seed ^ 8429);
								neighbour.baseHeight = totalHeight - neighbour.waterHeight;
							} else {
								neighbour.baseHeight = node.height() + randf(neighbour.id, this.graph.seed ^ 3627) * settings.plainsSlope / (node.height() - neighbour.height() + 1);
							}
						}
					}
					neighbour.drain = node.id;
					fringe.put(neighbour);
					visited.add(neighbour.id.hash());
				}
				if (neighbour.isWaterBody() && !processed.has(neighbour.id.hash()) && !neighbour.isSink()) {
					neighbour.drains.push(node.id);
				}
			}
		}
		return sorted;
	}

	drain(nodes, rainfall) {
		for (let i=nodes.length; i--;) {
			let node = nodes[i];
			if (node.isSink()) {
				continue;
			}
			node.water += rainfall * node.size * node.size;
			let drains = this.graph.drains(node);
			for (let drain of drains) {
				drain.water += node.water / drains.length;
			}
		}
	}

	erode(nodes, amount, settings) {
		for (let node of nodes) {
			if (node.isSink()) {
				continue;
			}
			let drain = this.graph.drain(node)
			let dh = (node.baseHeight - drain.baseHeight);
			if (dh <= 0) {
				continue;
			}
			let water = drain.isSink() ? 1 : drain.water;
			let erosion = Math.sqrt(water) * amount / node.size;
			if (node.isSea()) {
				erosion *= settings.seaErosion;
			} else if (node.isWaterBody()) {
				erosion *= settings.lakeErosion;
			}
			let newHeight = Math.min(drain.baseHeight + dh / Math.max(1,erosion), node.baseHeight);
			let eroded = node.baseHeight - newHeight;
			node.changeGround(-eroded);
			this.sediment.created += eroded;
			node.sediment += eroded;
		}
	}

	depose(nodes, amount, lakeDepose) {
		if (amount <= 0) {
			return;
		}
		for (let i=nodes.length; i--;) {
			let node = nodes[i];
			if (node.isSink()) {
				this.sediment.lost += node.sediment;
				continue;
			}
			let drains = this.graph.drains(node);
			let deposited = node.sediment * amount / node.water;
			if (node.isWaterBody() && drains.every(n => n.isWaterBody())) {
				deposited *= lakeDepose;
			}
			node.sediment -= deposited;
			node.changeGround(deposited);
			this.sediment.deposited += deposited;

			let sediment = node.sediment;
			for (let drain of drains) {
				drain.sediment += sediment / drains.length;
			}
		}
	}
}



function generate(settings) {
	console.log("  start generating", settings);
	let startTime = Date.now();
	let size = settings.size;
	let graph = time("initialize graph", () => new NodeGraph(settings.seed, vec2(size, size), settings.nodeSize || 8, settings.nodeRandomness));
	let world = new World(graph);
	time("heighten", () => world.heighten(settings.amplitude, settings.featureSize, settings.baseHeight, settings.warpSize, settings.warpEffect));
	time("cut edge", () => world.cutEdge(settings.edgeHeight, size * 0.005 * settings.edgePercentage, settings.edgeMode == "add", settings.edgeShape == "parabole"));
	let sorted = time("land", () => world.land(settings));
	time("drain", () => world.drain(sorted, settings.rainfall));
	if (settings.drawPartial) {
		time("draw partial", () => graph.draw("partial", settings));
	} else {
		document.getElementById("partial").hidden = true;
	}
	let erosionScale = scaleExp(settings.iterations, settings.erosionStep);
	for (let i=0; i<settings.iterations; ++i) {
		let erosion = settings.erosion * Math.pow(settings.erosionStep, i) * erosionScale;
		time("erode", () => world.erode(sorted, erosion, settings));
		if (!(settings.skipFinalDepose &&i === settings.iterations - 1)) {
			time("depose", () => world.depose(sorted, settings.deposition, settings.lakeDeposition));
		}
		graph.reset();
		sorted = time("land", () => world.land(settings));
		time("drain", () => world.drain(sorted, settings.rainfall));
	}
	time("draw", () => graph.draw(null, settings));
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
			settings[input.name] = n(input);
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
