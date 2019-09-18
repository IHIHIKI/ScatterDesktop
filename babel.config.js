module.exports = {
	'env': {
		'prod':{
			"presets": [
				[
					"@babel/preset-env",
					{
						"modules": false
					}
				]
			],
			"plugins": [
				"@babel/plugin-syntax-dynamic-import",
				["@babel/plugin-transform-runtime",
					{
						"regenerator": true
					}
				]
			]
		},
		'test': {
			"presets": ["@babel/preset-env"],
			"plugins": [
				["@babel/transform-runtime"]
			],
		}
	},
}
