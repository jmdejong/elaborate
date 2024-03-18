"use strict";

class CanvasView {

	drawGraph(graph, settings, displayId) {
		let canvas = document.getElementById(displayId);
		canvas.hidden = false;
		let display = new Display(canvas);
		display.resize(graph.size)

		if (settings.drawArea) {
			display.eachPixel(p => {
				let n = graph.nearest(p);
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
			for (let node of graph.all()) {
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
			for (let node of graph.all()) {
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

	drawWorldGraph(graph, settings) {
		this.drawGraph(graph, settings, "worldlevel")
	}

	drawPartialGraph(graph, settings) {
		this.drawGraph(graph, settings, "partial")
	}

	hidePartialDisplay() {
		document.getElementById("partial").hidden = true;
	}

	showNodeCount(nodeCount) {
		document.getElementById("nodecount").textContent = nodeCount;
	}

	showSettings(settings) {
		document.getElementById("currentsettings").textContent =
			Object.entries(settings)
				.map(([k, v]) => `${k}: ${v}`)
				.join("\n");
	}

	status(s) {
		document.getElementById("status").textContent = s;
	}

	async time(description, fn) {
		document.getElementById("status").textContent = "generating: " + description;
		return await time(description, fn);
	}

	setWorld(world) {
		window.world = world;
	}
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

	let view = new CanvasView();

	let form = document.getElementById("settings");
	form.addEventListener("submit", e => generate(readSettings(e.target.elements), view));
	generate(readSettings(form.elements), view);

	document.getElementById("redraw").addEventListener("click", e => {
		view.drawWorldGraph(world.graph, readSettings(form.elements));
	});
}

window.addEventListener("load", main);
