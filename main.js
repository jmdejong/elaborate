"use strict";

class CanvasView {

	drawGraph(graph, displayId) {
		let settings = readSettings(document.getElementById("drawsettings"));

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
					let v = n.height();
					if (v != v) {
						console.log(n);
					}
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

	drawWorldGraph(graph) {
		this.drawGraph(graph, "worldlevel")
	}

	drawPartialGraph(graph) {
		this.drawGraph(graph, "partial")
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
		if (input.classList.contains("colorscale")) {
			return ColorScale.fromInput(input, input.parentElement.getElementsByTagName("canvas")[0]);
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
	for (let input of form.elements) {
		if (input.name) {
			settings[input.name] = n(input);
		}
	}
	if (!settings.seed) {
		settings.seed = Math.random() * 1e7 | 0;
	}
	return settings;
}

function applyHashParameters() {
	let formCodes = window.location.hash.slice(1).split(";");
	for (let formCode of formCodes) {
		let [formId, formSettings] = formCode.split(":");
		var form = document.getElementById(formId);
		if (!(form instanceof HTMLFormElement)) {
			console.error("Not a form", formId, form);
			continue;
		}
		if (!formSettings) { continue; }
		for (let formSetting of formSettings.split(",")) {
			let [name, value] = formSetting.split("=");
			let input = form.elements[name];
			if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) {
				console.error("not an input", name, input);
				continue;
			}
			if (input.type == "checkbox") {
				input.checked = value == "true";
			} else {
				input.value = value
			}
		}
	}
}

function updateHashParameters() {
	let changedForms = [];
	for (let form of document.getElementsByClassName("settings")) {
		let changedInputs = [];
		for (let input of form.elements) {
			if (!input.name) {
				continue;
			}
			if (input instanceof HTMLSelectElement) {
				let defaultValue = input.options[0].value;
				for (let option of input.options) {
					if (option.defaultSelected) {
						defaultValue = option.value;
						break;
					}
				}
				if (input.value != defaultValue) {
					changedInputs.push(input.name + "=" + input.value);
				}
			} else if (input.type == "checkbox") {
				if (input.checked != input.defaultChecked) {
					changedInputs.push(input.name + "=" + input.checked);
				}
			} else {
				if (input.value != input.defaultValue) {
					changedInputs.push(input.name + "=" + input.value);
				}
			}
		}
		if (changedInputs.length > 0) {
			changedForms.push(form.id + ":" + changedInputs.join(","));
		}
	}
	if (changedForms.length > 0) {
		window.location.hash = "#" + changedForms.join(";");
	} else {
		window.location.hash = "";
	}
}


function main() {
	for (let form of document.getElementsByClassName("settings")) {
		form.addEventListener("change", updateHashParameters);
	}
	applyHashParameters();
	updateHashParameters()

	for (let colorInput of document.getElementsByClassName("colorscale")) {
		let preview = colorInput.parentElement.getElementsByClassName("colorpreview")[0];
		colorInput.addEventListener("input", e => ColorScale.fromInput(e.target, preview));
		ColorScale.fromInput(colorInput, preview);
	}

	let view = new CanvasView();

	let form = document.getElementById("worldsettings");
	form.addEventListener("submit", e => {
		generate(readSettings(e.target), view)
		updateHashParameters()
	});
	generate(readSettings(form), view);

	document.getElementById("drawsettings").addEventListener("submit", e => {
		view.drawWorldGraph(world.graph);
		updateHashParameters()
	});
}

window.addEventListener("hashchange", applyHashParameters)
window.addEventListener("load", main);

