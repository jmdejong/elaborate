
import * as THREE from '/three.module.min.js';

const movementSpeed = 2;
const boostSpeed = 100;
const UP = new THREE.Vector3(0, 1, 0);

class ThreeView {

	constructor() {

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 85, window.innerWidth / window.innerHeight, 0.1, 1000 );

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		document.body.appendChild( this.renderer.domElement );
		this.renderer.domElement.addEventListener("click", async () => {
			await this.renderer.domElement.requestPointerLock();
		});
		addEventListener("keydown", async e => {
			if (e.code === "KeyE") {
				await document.exitPointerLock();
			}
		});

		let lookAround = e => {
			this.camera.rotation.y -= e.movementX / window.innerWidth * 5;
			this.camera.rotation.x = clamp(this.camera.rotation.x - e.movementY / window.innerWidth * 5, -Math.PI/2, Math.PI/2);
		};

		document.addEventListener("pointerlockchange", () => {
			if (document.pointerLockElement === this.renderer.domElement) {
				console.log("The pointer lock status is now locked");
				document.addEventListener("mousemove", lookAround);
			} else {
				console.log("The pointer lock status is now unlocked");
				document.removeEventListener("mousemove", lookAround);
			}
		});

		this.input = new Input({
			KeyW: "forward",
			KeyS: "back",
			KeyA: "left",
			KeyD: "right",
			ShiftLeft: "boost",
			KeyC: "down",
			Space: "up"
		});
		this.input.initialize();

		this.camera.position.z = 5;
		this.camera.position.y = 50;
		this.camera.rotation.order = "YXZ";

		const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
		directionalLight.position.set(0.1, 1, 0.8);
		this.scene.add(directionalLight);
		const ambientLight = new THREE.AmbientLight( 0x404040 ); // soft white light
		this.scene.add(ambientLight);
	}


	drawWorldGraph(graph, settings) {
		console.log("drawing graph 3d");
		let v = [];
		let c = []
		for (let triangle of graph.triangles()) {
			for (let node of triangle) {
				v.push(node.pos.x, node.height() * 64, node.pos.y);
				if (node.isSea()) {
					c.push(0, 0, 225);
				} else if (node.isWaterBody()) {
					c.push(76, 76, 255);
				} else {
					c.push(...settings.colorScale.rgbFloats(node.height() / settings.colorMax));
				}
			}
		}
		let vertices = new Float32Array(v);
		let colors = new Float32Array(c);
		console.log(colors);

		const geometry = new THREE.BufferGeometry();

		geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geometry.computeBoundingBox();
		geometry.computeVertexNormals()

		let ground = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({vertexColors: true}));
		ground.position.x -= settings.size / 2;
		ground.position.z -= settings.size / 2;
		this.scene.add(ground);

		console.log("graph 3d drawn");
	}

	drawPartialGraph(graph, settings) { }

	hidePartialDisplay() { }

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

	update(elapsed) {
		let movement = new THREE.Vector3(
				this.input.inputs.right - this.input.inputs.left,
				this.input.inputs.up - this.input.inputs.down,
				this.input.inputs.back - this.input.inputs.forward,
			)
			.multiplyScalar(elapsed * (this.input.inputs.boost ? boostSpeed : movementSpeed))
			.applyAxisAngle(UP, this.camera.rotation.y);

		this.camera.position.add(movement);

		this.renderer.render(this.scene, this.camera);
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
	// let colorInput = document.getElementById("colorscale")
	// colorInput.addEventListener("input", e => ColorScale.fromInput(e.target, "colorpreview"));
	// ColorScale.fromInput(colorInput, "colorpreview");

	let view = new ThreeView();

	let form = document.getElementById("settings");
	// form.addEventListener("submit", e => generate(readSettings(e.target.elements), view));
	generate(readSettings(form.elements), view);

	// document.getElementById("redraw").addEventListener("click", e => {
	// 	view.drawWorldGraph(world.graph, readSettings(form.elements));
	// });



	let previousTimestamp = null;

	function update(timeStamp) {
		requestAnimationFrame(update);
		let elapsed = (previousTimestamp ? timeStamp - previousTimestamp : 1) / 1000 ;
		view.update(elapsed);
		previousTimestamp = timeStamp;
	}

	requestAnimationFrame(update);
}

class Input {

	constructor(mapping) {
		this.mapping = mapping;
		this.inputs = {};
		for (let key in mapping) {
			this.inputs[mapping[key]] = false;
		}
	}

	initialize() {
		addEventListener("keydown", e => this.inputs[this.mapping[e.code]] = true);
		addEventListener("keyup", e => this.inputs[this.mapping[e.code]] = false);
	}
}

window.addEventListener("load", main);
