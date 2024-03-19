

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

let THREE = null;
let view = null;


class ThreeView {

	constructor() {

		this.movementSpeed = 1;
		this.boostSpeed = 10;
		let canvas = document.getElementById("world3d");
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 85, window.innerWidth / window.innerHeight, 0.1, 1000 );

		this.renderer = new THREE.WebGLRenderer({canvas});
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		// document.body.appendChild( this.renderer.domElement );
		canvas.addEventListener("click", async () => {
			await canvas.requestPointerLock();
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
			if (document.pointerLockElement === canvas) {
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
		this.camera.position.y = 200;
		this.camera.rotation.order = "YXZ";
		this.camera.rotation.x = -Math.PI / 3;
		this.camera.rotation.y = -Math.PI * 3 / 4;

		const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
		directionalLight.position.set(0.1, 1, 0.4);
		this.scene.add(directionalLight);
		const ambientLight = new THREE.AmbientLight(0x88888888);
		this.scene.add(ambientLight);
		this.currentGround = null;
		this.visible = false;
	}


	drawWorldGraph(graph) {
		console.log("drawing graph 3d");
		let settings = readSettings(document.getElementById("draw3dsettings"));
		console.log(settings);
		this.movementSpeed = settings.movementSpeed;
		this.boostSpeed = settings.boostSpeed;
		let vertices = [];
		let colors = []
		let indices = [];
		if (settings.flatFaces) {
			for (let triangle of graph.triangles()) {
				for (let node of triangle) {
					vertices.push(node.pos.x * settings.horizontalScale, node.height() * settings.heightScale, node.pos.y * settings.horizontalScale);
					if (node.isSea()) {
						colors.push(0, 0, 0.9);
					} else if (node.isWaterBody()) {
						colors.push(0.2, 0.2, 1);
					} else {
						colors.push(...settings.colorScale.rgbFloats(node.height() / settings.colorMax));
					}
				}
			}
		} else {
			let nodeIndex = new Map();
			let i = 0;
			for (let node of graph.all()) {
				vertices.push(node.pos.x * settings.horizontalScale, node.height() * settings.heightScale, node.pos.y * settings.horizontalScale);
				if (node.isSea()) {
					colors.push(0, 0, 0.9);
				} else if (node.isWaterBody()) {
					colors.push(0.2, 0.2, 1);
				} else {
					colors.push(...settings.colorScale.rgbFloats(node.height() / settings.colorMax));
				}
				nodeIndex.set(node.id.hash(), i++);
			}

			for (let triangle of graph.triangles()) {
				for (let node of triangle) {
					indices.push(nodeIndex.get(node.id.hash()));
				}
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
		if (!settings.flatFaces) {
			geometry.setIndex(indices);
		}
		geometry.computeBoundingBox();
		geometry.computeVertexNormals()

		let ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors: true}));
		if (settings.centerMesh) {
			ground.position.x -= graph.size.x * settings.horizontalScale / 2;
			ground.position.z -= graph.size.y * settings.horizontalScale / 2;
		}
		this.scene.remove(this.currentGround);
		this.scene.add(ground);
		this.currentGround = ground;

		console.log("graph 3d drawn");
	}

	show() {
		this.visible = true
		document.getElementById("view3d").hidden = false;
	}

	hide() {
		this.visible = false;
		document.getElementById("view3d").hidden = true;
	}


	update(elapsed) {
		let movement = new THREE.Vector3(
				this.input.inputs.right - this.input.inputs.left,
				this.input.inputs.up - this.input.inputs.down,
				this.input.inputs.back - this.input.inputs.forward,
			)
			.multiplyScalar(elapsed * (this.input.inputs.boost ? this.boostSpeed : this.movementSpeed))
			.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camera.rotation.y);

		this.camera.position.add(movement);

		this.renderer.render(this.scene, this.camera);
	}
}


async function render3d() {

	if (!THREE) {
		THREE = await import("/three.module.min.js")
	}
	if (!view) {
		view = new ThreeView();
	}
	view.show();
	view.drawWorldGraph(world.graph);

	let previousTimestamp = null;

	function update(timeStamp) {
		if (view.visible) {
			requestAnimationFrame(update);
		}
		let elapsed = (previousTimestamp ? timeStamp - previousTimestamp : 1) / 1000 ;
		view.update(elapsed);
		previousTimestamp = timeStamp;
	}

	requestAnimationFrame(update);
}

function close3d() {
	view.hide();
}

let settingsForm = document.getElementById("draw3dsettings");
settingsForm.addEventListener("submit", render3d);
settingsForm.hidden = false;

document.getElementById("close3d").addEventListener("click", close3d);

