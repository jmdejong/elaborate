"use strict";

const TRIHEIGHT = 0.866;

class Node {
	constructor(id, pos, size) {
		this.id = id;
		this.pos = pos;
		this.size = size;
		this.baseHeight = 0;
		this.sink = false;
		this.sea = false;
		this.waterHeight = 0;
		this.drains = [];
		this.water = 0;
		this.outflow = [];
		this.momentum = 0;
		this.sediment = 0;
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
		for (let node of this.nodes.values()) {
			node.neighbours = this.neighbours(node);
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

	drains(node) {
		if (!node.drains.length) {
			console.error("no drains found", node);
			return null;
		}
		return node.drains.map(id  => this.getNode(id));
	}

	all() {
		return this.nodes.values();
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
		let canvas = document.getElementById(id);
		canvas.hidden = false;
		canvas.width = this.size.x;
		canvas.height = this.size.y;
		let display = new Display(canvas)
		if (settings.drawArea) {
			display.eachPixel(p => {
				let n = this.nearest(p);
				if (n.isSea()) {
					return [0, 0, 225];
				} else if (n.isWaterBody()) {
					return [76, 76, 255];
				} else {
					return settings.colorScale.rgbBytes(n.height() / settings.colorMax);
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
					display.circle(node.pos, node.size * 0.5, settings.colorScale.name(node.height() / settings.colorMax));
				}
			}
		}
		if (settings.drawRivers) {
			for (let node of this.all()) {
				if (node.isSink() || !settings.drawUnderwaterStreams && node.isWaterBody()) {
					continue;
				}
				for (let [drain, o] of node.outflow) {
					let water = node.water * o
					if (water < settings.riverMin) {
						continue;
					}
					display.line(
						node.pos,
						drain.pos,
						"#22f",
						clamp(
							Math.sqrt(water)*settings.riverScale,
							settings.riverMinWidth,
							settings.riverMaxWidth
						)
					);
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

	heighten(seed, amplitude, featureSize, base, warpSize, warpEffect) {
		let noise = new Simplex(seed, 8, 1/featureSize);
		let xwarp = new Simplex(seed ^ 123, 4, 1/warpSize);
		let ywarp = new Simplex(seed ^ 321, 4, 1/warpSize);
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

	land(plainsSlope, lakeAmount, lakeSize, lakeDepth, baseErosion, momentumErosion) {
		let noise = new FastNoiseLite(hash(this.graph.seed^23790));
		noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		noise.SetFractalType(FastNoiseLite.FractalType.FBm);
		noise.SetFractalOctaves(8);
		noise.SetFrequency(1/lakeSize);
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
			for (let neighbour of node.neighbours) {
				if (!visited.has(neighbour.id.hash())) {
					let dh = neighbour.baseHeight - node.baseHeight;
					if (dh > 0 && !neighbour.waterHeight) {
						let water = node.isSink() ? 1 : node.water;
						let erosion = Math.sqrt(water) * (baseErosion + momentumErosion*neighbour.momentum) / neighbour.size;
						let newHeight = clamp(node.baseHeight + dh / (1+erosion), node.baseHeight, neighbour.baseHeight);
						let eroded = neighbour.baseHeight - newHeight;
						neighbour.changeGround(-eroded);
						this.sediment.created += eroded;
						neighbour.sediment += eroded;
					}
					neighbour.waterHeight = 0;
					neighbour.sea = false;
					neighbour.drains = [];
					if (neighbour.height() < node.height()) {
						if (node.isSea()) {
							neighbour.waterHeight = node.height() - neighbour.baseHeight + 1e-7 * (2+randf(neighbour.id, this.graph.seed ^ 4890));
							neighbour.sea = true;
						} else {
							let l = clamp(noise.GetNoise(neighbour.pos.x, neighbour.pos.y) + lakeAmount * 2 - 1, -1, 1);
							if (l > 0) {
								neighbour.waterHeight = l * (node.height() - neighbour.height()) * lakeDepth;
								let totalHeight = node.height() + 1e-6 * randf(neighbour.id, this.graph.seed ^ 8429);
								neighbour.baseHeight = totalHeight - neighbour.waterHeight;
							} else {
								neighbour.baseHeight = node.height() + randf(neighbour.id, this.graph.seed ^ 3627) * plainsSlope / (node.height() - neighbour.height() + 1);
							}
						}
					}
					fringe.put(neighbour);
					visited.add(neighbour.id.hash());
				}
				if (!processed.has(neighbour.id.hash()) && !neighbour.isSink()) {
					neighbour.drains.push(node.id);
				}
			}
		}
		return sorted;
	}

	drain(nodes, rainfall, cohesion, slowing) {
		for (let node of nodes) {
			node.water = 0
			node.outflow = [];
			node.momentum = 0;
		}
		for (let i=nodes.length; i--;) {
			let node = nodes[i];
			if (node.isSink()) {
				continue;
			}
			node.water += rainfall * node.size * node.size;
			let drains = this.graph.drains(node);
			let total = 0;
			let nh = node.height();
			let outflow = [];
			for (let drain of drains) {
				let dh = nh - drain.height();
				node.momentum += dh;
				let o = node.isWaterBody() ? 1 : dh**cohesion;
				outflow.push([drain, o]);
				total += o;
			}
			node.momentum *= slowing;
			node.outflow = outflow.map(([d, o]) => [d, o/total]);
			for (let [drain, o] of node.outflow) {
				drain.water += node.water * o;
				drain.momentum += node.momentum * o;
			}

		}
	}

	depose(nodes, amount, depthFactor) {
		if (amount <= 0) {
			return;
		}
		for (let i=nodes.length; i--;) {
			let node = nodes[i];
			if (node.isSink()) {
				this.sediment.lost += node.sediment;
				node.sediment = 0;
				continue;
			}
			let drains = this.graph.drains(node);
			let deposited = clamp((amount +node.waterHeight * depthFactor) * node.sediment / (node.water+amount) / (node.momentum+1), 0, node.sediment);
			node.sediment -= deposited;
			node.changeGround(deposited);
			this.sediment.deposited += deposited;
			for (let [drain, o] of node.outflow) {
				drain.sediment += node.sediment * o;
			}
			node.sediment = 0;
		}
	}
}

async function generate(settings) {
	console.log("  start generating", settings);
	let startTime = Date.now();
	let size = settings.size;
	document.getElementById("nodecount").textContent = "";
	document.getElementById("currentsettings").textContent =
		Object.entries(settings)
			.map(([k, v]) => `${k}: ${v}`)
			.join("\n");
	let graph = await time("initialize graph", () => new NodeGraph(settings.seed, vec2(size, size), settings.nodeSize || 8, settings.nodeRandomness));
	document.getElementById("nodecount").textContent = graph.nodes.size
	let world = new World(graph);
	await time("heighten", () => world.heighten(settings.seed^61882, settings.amplitude, settings.featureSize, settings.baseHeight, settings.warpSize, settings.warpEffect));
	await time("cut edge", () => world.cutEdge(settings.edgeHeight, size * 0.005 * settings.edgePercentage, settings.edgeMode == "add", settings.edgeShape == "parabole"));
	let sorted = await time("flow", () => world.land(settings.plainsSlope, settings.lakeAmount, settings.lakeSize, settings.lakeDepth, 0, 0));
	await time("drain", () => world.drain(sorted, settings.rainfall, settings.cohesion, Math.pow(settings.slowing, settings.nodeSize)));
	if (settings.drawPartial) {
		await time("draw partial", () => graph.draw("partial", settings));
	} else {
		document.getElementById("partial").hidden = true;
	}
	let erosionScale = 1;
	if (settings.compensateErosion) {
		erosionScale = scaleExp(settings.iterations, settings.erosionStep);
	}
	let detailFactor = 1;
	for (let i=0; i<settings.iterations; ++i) {
		await time("depose", () => world.depose(sorted, settings.deposition, settings.depositionDepthFactor));
		await time("detail", () => world.heighten(settings.seed^(9009*i), settings.detailAmplitude*detailFactor, settings.detailSize*detailFactor, 0, 1, 0));
		detailFactor *= settings.detailStep;
		let erosionWeight = Math.pow(settings.erosionStep, i) * erosionScale;
		sorted = await time("flow", () => world.land(settings.plainsSlope, settings.lakeAmount, settings.lakeSize, 1, settings.baseErosion * erosionWeight, settings.momentumErosion * erosionWeight));
		await time("drain", () => world.drain(sorted, settings.rainfall, settings.cohesion, Math.pow(settings.slowing, settings.nodeSize)));
	}
	await time("draw", () => graph.draw("worldlevel", settings));
	console.log(`sediment created: ${world.sediment.created / 1e6}, sediment deposited: ${world.sediment.deposited/1e6}, sediment lost: ${world.sediment.lost/1e6}, balance: ${(world.sediment.created - world.sediment.deposited - world.sediment.lost)/1e6}`);
	let endTime = Date.now();
	console.log("  generate done", (endTime - startTime) / 1000);
	window.world = world;
	document.getElementById("status").textContent = `generate done  ${(endTime - startTime) / 1000}s`
}

function readSettings(form) {
	function n(input) {
		if (input.id === "colorscale") {
			return ColorScale.fromInput(input, "colorpreview");
		} else if (input.type === "number") {
			return +(input.value || input.defaultValue);
		} else if (input.type === "checkbox") {
			return input.checked;
		} else if (input.type === "select-one") {
			return input.value;
		} else if (input.type === "text") {
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
	let colorInput = document.getElementById("colorscale")
	colorInput.addEventListener("input", e => ColorScale.fromInput(e.target, "colorpreview"));
	ColorScale.fromInput(colorInput, "colorpreview");

	let form = document.getElementById("settings");
	form.addEventListener("submit", e => generate(readSettings(e.target.elements)));
	generate(readSettings(form.elements));

	document.getElementById("redraw").addEventListener("click", e => {
		window.world.graph.draw("worldlevel", readSettings(form.elements));
	});
}

window.addEventListener("load", main);
