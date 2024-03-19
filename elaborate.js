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
		return this.isSea() || this.waterHeight > this.baseHeight+1e-8;
	}

	isSink() {
		return this.sink;
	}

	height() {
		return Math.max(this.baseHeight, this.waterHeight);
	}

	waterVolume() {
		return Math.max(this.waterHeight - this.baseHeight, 0);
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

	triangles() {
		let tris = [];
		for (let node of this.nodes.values()) {
			let right = this.getNode(node.id.add(vec2(1, 0)));
			let bottom = this.getNode(node.id.add(vec2(0, 1)));
			let bottomleft = this.getNode(node.id.add(vec2(-1, 1)));
			if (right && bottom) {
				tris.push([node, bottom, right]);
			}
			if (bottom && bottomleft) {
				tris.push([node, bottomleft, bottom]);
			}
		}
		return tris;
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
			node.waterHeight = 0;
		}
		while (!fringe.isEmpty()) {
			let node = fringe.take();
			sorted.push(node);
			processed.add(node.id.hash());
			for (let neighbour of node.neighbours) {
				if (!visited.has(neighbour.id.hash())) {
					let dh = neighbour.baseHeight - node.baseHeight;
					if (dh > 0 && !neighbour.isWaterBody()) {
						let water = node.isSink() ? 1 : node.water;
						let erosion = Math.sqrt(water) * (baseErosion + momentumErosion*neighbour.momentum) / neighbour.size;
						let newHeight = clamp(node.baseHeight + dh / (1+erosion), node.baseHeight, neighbour.baseHeight);
						let eroded = neighbour.baseHeight - newHeight;
						if (!eroded && eroded !== 0) {
							console.log("erosion error", erosion, water, baseErosion, momentumErosion, neighbour.momentum, neighbour.size);
						}
						neighbour.changeGround(-eroded);
						this.sediment.created += eroded;
						neighbour.sediment += eroded;
					}
					neighbour.waterHeight = -1e9;
					neighbour.sea = false;
					neighbour.drains = [];
					if (neighbour.height() < node.height()) {
						neighbour.waterHeight = node.height() + 1e-7 * (2+randf(neighbour.id, this.graph.seed ^ 4890));
						if (node.isSea()) {
							// neighbour.waterHeight = node.waterHeight + 1e-7 * (2+randf(neighbour.id, this.graph.seed ^ 4890));
							neighbour.sea = true;
						} else {
							let l = clamp(noise.GetNoise(neighbour.pos.x, neighbour.pos.y) + lakeAmount * 2 - 1, 0, 1) * lakeDepth;
							neighbour.baseHeight = neighbour.baseHeight * l + neighbour.waterHeight * (1-l);
						}
					} else {
						neighbour.waterHeight = node.waterHeight + 1e-7 * (2+randf(neighbour.id, this.graph.seed ^ 8429));
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
				if (!(dh >= 0)) {
					console.log("drain order error", dh, nh, dh);
				}
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
			let deposited = clamp((amount + node.waterVolume()* depthFactor) * node.sediment / (node.water+amount) / (node.momentum+1), 0, node.sediment);
			node.sediment -= deposited;
			if (!deposited && deposited !== 0) {
				console.log("deposit error", deposited);
			}
			node.changeGround(deposited);
			this.sediment.deposited += deposited;
			for (let [drain, o] of node.outflow) {
				drain.sediment += node.sediment * o;
			}
			node.sediment = 0;
		}
	}

	amplifyWater() {
		for (let node of this.graph.all()) {
			if (node.isWaterBody()) {
				continue;
			}
			let wetNeighbours = node.neighbours.filter(n => n.isWaterBody());
			if (wetNeighbours.length) {
				node.waterHeight = Math.min(node.height(), wetNeighbours.reduce((acc, n) => acc + n.waterHeight, 0) / wetNeighbours.length)
			} else {
				node.waterHeight = -1e6;
			}
		}
	}
}


async function generate(settings, view) {
	console.log("  start generating", settings);
	let startTime = Date.now();
	let size = settings.size;
	view.showSettings(settings);
	let graph = await view.time("initialize graph", () => new NodeGraph(settings.seed, vec2(size, size), settings.nodeSize || 8, settings.nodeRandomness));
	view.showNodeCount(graph.nodes.size);
	let world = new World(graph);
	await view.time("heighten", () => world.heighten(settings.seed^61882, settings.amplitude, settings.featureSize, settings.baseHeight, settings.warpSize, settings.warpEffect));
	await view.time("cut edge", () => world.cutEdge(settings.edgeHeight, size * 0.005 * settings.edgePercentage, settings.edgeMode == "add", settings.edgeShape == "parabole"));
	let sorted = await view.time("flow", () => world.land(settings.plainsSlope, settings.lakeAmount, settings.lakeSize, settings.lakeDepth, 0, 0));
	await view.time("drain", () => world.drain(sorted, settings.rainfall, settings.cohesion, Math.pow(settings.slowing, settings.nodeSize)));
	if (settings.drawPartial) {
		await view.time("draw partial", () => view.drawPartialGraph(graph, settings));
	} else {
		view.hidePartialDisplay
	}
	let erosionScale = 1;
	if (settings.compensateErosion) {
		erosionScale = scaleExp(settings.iterations, settings.erosionStep);
	}
	let detailFactor = 1;
	for (let i=0; i<settings.iterations; ++i) {
		await view.time("depose", () => world.depose(sorted, settings.deposition, settings.depositionDepthFactor));
		await view.time("detail", () => world.heighten(settings.seed^(9009*i), settings.detailAmplitude*detailFactor, settings.detailSize*detailFactor, 0, 1, 0));
		detailFactor *= settings.detailStep;
		let erosionWeight = Math.pow(settings.erosionStep, i) * erosionScale;
		sorted = await view.time("flow", () => world.land(settings.plainsSlope, settings.lakeAmount, settings.lakeSize, 1, settings.baseErosion * erosionWeight, settings.momentumErosion * erosionWeight));
		await view.time("drain", () => world.drain(sorted, settings.rainfall, settings.cohesion, Math.pow(settings.slowing, settings.nodeSize)));
	}
	await view.time("amplify water", () => world.amplifyWater());
	await view.time("draw", () => view.drawWorldGraph(graph, settings));
	console.log(`sediment created: ${world.sediment.created / 1e6}, sediment deposited: ${world.sediment.deposited/1e6}, sediment lost: ${world.sediment.lost/1e6}, balance: ${(world.sediment.created - world.sediment.deposited - world.sediment.lost)/1e6}`);
	let endTime = Date.now();
	console.log("  generate done", (endTime - startTime) / 1000);
	view.setWorld(world)
	view.status(`generate done  ${(endTime - startTime) / 1000}s`);
}

