"use strict";

class Display {

	constructor(canvas) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
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
}
