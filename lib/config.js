import makeConfig from '../../../lib/plugins/config.js'

export const { config, configSave } = await makeConfig(
	'ICQQ',
	{
		tips: '',
		permission: 'master',
		captcha_url: 'https://captcha.521002.xyz',
		markdown: {
			mode: false,
			button: false,
			callback: true
		},
		bot: {},
		token: [],
		reconnect: {
			enable: true,
			kickoff: true,
			interval: 5,
			max_interval: 300,
			max_attempts: 0,
			notify_interval: 10
		}
	},
	{
		tips: [
			'欢迎使用 TRSS-Yunzai ICQQ Plugin ! 作者：时雨🌌星空',
			'参考：https://github.com/TimeRainStarSky/Yunzai-ICQQ-Plugin'
		]
	}
)
