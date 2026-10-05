import { segment } from 'icqq'
import { config } from './config.js'

/** 未配置时使用的验证码站点 */
const DEFAULT_CAPTCHA_URL = 'https://captcha.521002.xyz'

/** 绑定 icqq 登录流程事件 */
export function setupLogin(bot, { id, password, send, get, logger }) {
	let reply = send
	let replied = false
	const retry = `发送 #Bot上线${id} 重新登录`
	const tips = typeof get === 'function' ? '发送 ' : `发送 #Bot验证${id}:`
	const captchaUrl = String(config.captcha_url || DEFAULT_CAPTCHA_URL).replace(/\/+$/, '')

	if (typeof get !== 'function')
		get = () =>
			new Promise((resolve) =>
				Bot.once(`verify.${id}`, (data) => {
					reply = data.reply
					replied = true
					resolve(data.msg)
				})
			)

	bot.on('system.login.qrcode', async (data) => {
		Bot.em('system.login.qrcode', data)
		reply([`[${id}] 扫码登录`, segment.image(data.image)])
		for (;;) {
			await Bot.sleep(3000)
			const { retcode } = await bot.queryQrcodeResult()
			if (retcode === 0) return bot.qrcodeLogin()
			if (retcode === 17) return reply(`二维码已过期，${retry}`)
			if (retcode === 54) return reply(`登录取消，${retry}`)
		}
	})

	bot.on('system.login.slider', async (data) => {
		Bot.em('system.login.slider', data)
		const api = `${captchaUrl}/?uin=${id}`
		try {
			const res = await (await fetch(api)).json()
			Bot.makeLog('debug', ['验证码注册', res], id)
		} catch (err) {
			Bot.makeLog('error', ['验证码注册错误', err], id)
			return reply(`滑动验证错误，${retry}`)
		}

		const params = new URL(data.url).searchParams
		const url = new URL(captchaUrl)
		for (const key of ['aid', 'login_appid', 'sid']) url.searchParams.set(key, params.get(key) || '')
		url.searchParams.set('uin', id)
		reply(`[${id}] 请打开下方链接完成滑动验证\n${url}`)

		try {
			for (let i = 0; i < 60; i++) {
				await Bot.sleep(3000)
				const res = await (await fetch(api, { method: 'POST' })).json()
				Bot.makeLog('debug', ['Ticket', res], id)
				if (res.status === 'ready') {
					const ticket = res.result?.ticket
					const randstr = res.result?.randstr ?? res.result?.randStr
					if (ticket && randstr) return bot.submitSlider(`${ticket},${randstr}`)
				} else if (res.status !== 'pending') {
					Bot.makeLog('warn', ['验证状态错误', res], id)
				}
			}
		} catch (err) {
			Bot.makeLog('error', ['验证请求错误', err], id)
			return reply(`滑动验证错误，${retry}`)
		}
		return reply(`滑动验证超时，${retry}`)
	})

	bot.on('system.login.device', async (data) => {
		Bot.em('system.login.device', data)
		reply(
			`[${id}] 触发设备验证\n` +
				`请在QQ内点击下方链接完成验证, 复制到浏览器无效\n` +
				`通过验证后${tips}继续登录\n\n` +
				data.url
		)
		for (;;) if ((await get()) === '继续登录') return bot.login()
	})

	bot.on('system.login.auth', async (data) => {
		Bot.em('system.login.auth', data)
		const api = `${captchaUrl}/attack?uin=${id}`
		try {
			const res = await (
				await fetch(api, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data)
				})
			).json()
			Bot.makeLog('debug', ['登录验证注册', res], id)
			if (res.status !== 'registered') throw new Error(res.error || '注册失败')
		} catch (err) {
			Bot.makeLog('error', ['登录验证注册错误', err], id)
			return reply(`[${id}] 登录验证错误，${retry}`)
		}

		reply(`[${id}] 请打开下方链接完成登录验证\n${api}`)
		try {
			for (let i = 0; i < 60; i++) {
				await Bot.sleep(5000)
				const res = await (await fetch(api, { method: 'POST' })).json()
				Bot.makeLog('debug', ['登录验证', res], id)
				if (res.status === 'ready') return bot.login(id, password)
				if (res.status !== 'pending') Bot.makeLog('warn', ['验证状态错误', res], id)
			}
		} catch (err) {
			Bot.makeLog('error', ['验证请求错误', err], id)
			return reply(`[${id}] 登录验证错误，${retry}`)
		}
		return reply(`[${id}] 登录验证超时，${retry}`)
	})

	bot.on('system.login.error', (data) => {
		Bot.em('system.login.error', data)
		reply(`[${id}] 登录错误：${data.message}(${data.code})\n${retry}`)
	})

	bot.on('system.offline', (data) => {
		const index = Bot.uin.indexOf(id)
		if (index !== -1) Bot.uin.splice(index, 1)
		Bot.em('system.offline', data)
		reply(`[${id}] 账号下线：${data.message}\n${retry}`)
	})

	bot.on('system.online', (data) => {
		Bot.em('system.online', data)
		bot.logger = logger
		if (replied) reply(`[${id}] 登录完成`)
		Bot.em(`connect.${id}`, { self_id: id })
	})
}
