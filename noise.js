"use strict";

class Simplex {

	constructor(seed, octaves, frequency) {
		this.fnl = new FastNoiseLite(seed);
		this.fnl.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
		this.fnl.SetFractalType(FastNoiseLite.FractalType.FBm);
		this.fnl.SetFractalOctaves(octaves);
		this.fnl.SetFrequency(frequency);
	}

	noise(pos) {
		return this.fnl.GetNoise(pos.x, pos.y);
	}
}
