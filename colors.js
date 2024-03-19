"use strict";

class ColorScale {

	static fromColorNames(colorNames, canvas) {
		let ctx = canvas.getContext("2d");
		let gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
		for (let i=0; i<colorNames.length; ++i) {
			gradient.addColorStop(i / (colorNames.length-1), colorNames[i]);
		}
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		let data = ctx.getImageData(0, 1, canvas.width, 1).data;
		let colors = []
		for (let i=0; i<data.length; i += 4) {
			colors.push([data[i], data[i+1], data[i+2]]);
		}
		return new ColorScale(colors, colorNames.join(","));
	}

	static fromInput(input, canvasId) {
		try {
			let colorScale = ColorScale.fromColorNames(input.value.split(","), canvasId);
			input.setCustomValidity("");
			return colorScale;
		} catch (e) {
			input.setCustomValidity(e.message);
			throw e;
		} finally {
			input.reportValidity();
		}
	}

	constructor(colors, repr) {
		this.colors = colors;
		this.repr = repr;
	}

	rgbBytes(v) {
		let h = clamp(v * this.colors.length, 0, this.colors.length -1);
		let prev = this.colors[Math.floor(h)];
		let next = this.colors[Math.ceil(h)];
		let dh = h-Math.floor(h);
		return [0, 1, 2].map(i => prev[i] * (1-dh) + next[i] * dh);
	}

	rgbFloats(v){
		return this.rgbBytes(v).map(c => c/255);
	}

	name(v) {
		return `rgb(${this.rgbBytes(v).join(",")})`;
	}

	toString() {
		return this.repr;
	}
}
