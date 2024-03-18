"use strict";

class Display {

	constructor(canvas) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
	}

	resize(size) {
		this.canvas.width = size.x;
		this.canvas.height = size.y;
	}

	line(v1, v2, color, width) {
		if (!color) {
			color = "black";
		}
		this.ctx.strokeStyle = color;
		if (!width) {
			width = 1;
		}
		this.ctx.lineWidth = width;
		this.ctx.lineCap = "round";
		this.ctx.beginPath();
		this.ctx.moveTo(v1.x, v1.y);
		this.ctx.lineTo(v2.x, v2.y);
		this.ctx.stroke()
	}

	circle(center, radius, color) {
		if (!color) {
			color = "black";
		}
		this.ctx.fillStyle = color;
		this.ctx.beginPath();
		this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
		this.ctx.fill();
	}

	eachPixel(fn) {
		let imgData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
		let data = imgData.data;
		for (let x=0; x<this.canvas.width; ++x) {
			for (let y=0; y<this.canvas.height; ++y) {
				let [r, g, b] = fn(vec2(x, y));
				let i = (x + y * this.canvas.width) * 4;
				data[i] = r|0;
				data[i+1] = g|0;
				data[i+2] = b|0;
				data[i+3] = 255;
			}
		}
		this.ctx.putImageData(imgData, 0, 0);
	}
}
