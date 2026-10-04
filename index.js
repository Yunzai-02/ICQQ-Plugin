logger.info(logger.yellow('- 正在加载 ICQQ 适配器插件'))

import makeConfig from '../../lib/plugins/config.js'
import cfg from '../../lib/config/config.js'
import { ulid } from 'ulid'

import url from 'url'
import path from 'path'
import fs from 'node:fs/promises'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let icqq
try {
	const dir = `${__dirname}/node_modules/icqq/`
	const p = JSON.parse(await fs.readFile(`${dir}package.json`, 'utf8'))
	icqq = (await import(`file://${dir}${p.main}`)).default
	icqq.package = p
} catch (err) {
	icqq = err
}

if (icqq instanceof Error) throw icqq

const { config, configSave } = await makeConfig(
	'ICQQ',
	{
		tips: '',
		permission: 'master',
		markdown: {
			mode: false,
			button: false,
			callback: true
		},
		bot: {},
		token: []
	},
	{
		tips: [
			'欢迎使用 TRSS-Yunzai ICQQ Plugin ! 作者：时雨🌌星空',
			'参考：https://github.com/TimeRainStarSky/Yunzai-ICQQ-Plugin'
		]
	}
)

const adapter = new (class ICQQAdapter {
	constructor() {
		this.id = 'QQ'
		this.name = 'ICQQ'
		this.version = `v${icqq.package.version}`
	}

	async makeMarkdownImage(id, file) {
		const image = await Bot[id].uploadImage(file)
		return {
			des: `![图片 #${image.width || 0}px #${image.height || 0}px]`,
			url: `(${image.url})`
		}
	}

	makeMarkdownText(text) {
		const match = text.match(/https?:\/\/[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&:/~\+#]*[\w\-\@?^=%&/~\+#])?/g)
		if (match) for (const url of match) text = text.replace(url, `<${url}>`)
		return text
	}

	makeButton(id, pick, button, style, forward) {
		const msg = {
			id: ulid(),
			render_data: {
				label: button.text,
				visited_label: button.clicked_text,
				style,
				...button.QQBot?.render_data
			}
		}

		if (button.link)
			msg.action = {
				type: 0,
				permission: { type: 2 },
				data: button.link,
				...button.QQBot?.action
			}
		else if (button.input)
			msg.action = {
				type: 2,
				permission: { type: 2 },
				data: button.input,
				enter: button.send,
				...button.QQBot?.action
			}
		else if (button.callback)
			msg.action = {
				type: 2,
				permission: { type: 2 },
				data: button.callback,
				enter: true,
				...button.QQBot?.action
			}
		else return false

		if (forward && config.markdown.callback && (button.input || button.callback))
			for (const i of Bot.uin)
				if (Bot[i].adapter?.id === 'QQBot' && Bot[i].sdk?.config?.appid && Bot[i].callback) {
					msg.action.type = 1
					delete msg.action.data
					this.markdown_appid = Number(Bot[i].sdk.config.appid)
					Bot[i].callback[msg.id] = {
						self_id: id,
						user_id: pick.user_id,
						group_id: pick.group_id,
						message: button.input || button.callback
					}
					setTimeout(() => delete Bot[i].callback[msg.id], 3600000)
					break
				}

		if (button.permission) {
			if (button.permission === 'admin') {
				msg.action.permission.type = 1
			} else {
				msg.action.permission.type = 0
				msg.action.permission.specify_user_ids = String(button.permission)
			}
		}
		return msg
	}

	makeButtons(id, pick, button_square, forward) {
		const msgs = []
		const random = Math.floor(Math.random() * 2)
		for (const button_row of button_square) {
			let column = 0
			const buttons = []
			for (let button of button_row) {
				button = this.makeButton(id, pick, button, (random + msgs.length + buttons.length) % 2, forward)
				if (button) buttons.push(button)
			}
			if (buttons.length) msgs.push({ buttons })
		}
		return msgs
	}

	async makeMarkdownMsg(id, pick, msg) {
		const messages = []
		let content = ''
		const button = []
		const forward = []

		for (let i of Array.isArray(msg) ? msg : [msg]) {
			if (typeof i === 'object') i = { ...i }
			else i = { type: 'text', text: i }

			switch (i.type) {
				case 'text':
					content += this.makeMarkdownText(i.text)
					break
				case 'image': {
					const { des, url } = await this.makeMarkdownImage(id, i.file)
					content += `${des}${url}`
					break
				}
				case 'file':
					if (i.file) i.file = await Bot.fileToUrl(i.file, i)
					content += this.makeMarkdownText(`文件：${i.file}`)
					break
				case 'at':
					if (i.qq === 'all') {
						content += '[@全体成员](mqqapi://markdown/mention?at_type=everyone)'
					} else {
						if (!i.name) {
							let info
							if (pick.pickMember) info = pick.pickMember(i.qq).info
							info ??= Bot[id].pickFriend(i.qq).info || (await Bot[id].pickUser(i.qq).getSimpleInfo())
							if (info) i.name = info.card || info.nickname
						}

						if (i.name) i.name += `(${i.qq})`
						else i.name = i.qq
						content += `[@${i.name}](mqqapi://markdown/mention?at_type=1&at_tinyid=${i.qq})`
					}
					break
				case 'markdown':
					content += i.data
					break
				case 'button':
					if (i.data) button.push(...this.makeButtons(id, pick, i.data, true))
					else if (i.content?.rows) button.push(...i.content.rows)
					break
				case 'node':
					for (const node of i.data)
						for (const message of await this.makeMarkdownMsg(id, pick, node.message))
							forward.push({ user_id: 80000000, nickname: '匿名消息', ...node, ...message })
					break
				case 'raw':
					messages.push([icqq.Converter.prototype.hasOwnProperty(i.data?.type) ? i.data : i])
					break
				default:
					if (icqq.Converter.prototype.hasOwnProperty(i.type)) {
						messages.push([i])
						continue
					}
					content += this.makeMarkdownText(Bot.String(i))
			}
		}

		if (content) messages.unshift([{ type: 'markdown', content }])
		if (button.length) {
			for (const i of messages) {
				if (i[0].type === 'markdown')
					i.push({
						type: 'button',
						content: {
							appid: this.markdown_appid,
							rows: button.splice(0, 5)
						}
					})
				if (!button.length) break
			}
			while (button.length)
				messages.push([
					{ type: 'markdown', content: ' ' },
					{
						type: 'button',
						content: {
							appid: this.markdown_appid,
							rows: button.splice(0, 5)
						}
					}
				])
		}

		for (const i of messages) forward.push({ type: 'node', message: i })
		return forward
	}

	async makeMsg(id, pick, msg) {
		if (!Array.isArray(msg)) msg = [msg]
		const message = []
		const messages = []
		const forward = []
		let reply

		for (let i of msg) {
			if (typeof i === 'object')
				switch (i.type) {
					case 'text':
					case 'image':
					case 'face':
						break
					case 'file':
						await pick.sendFile(i.file, i.name)
						continue
					case 'reply':
						reply = i
						continue
					case 'at':
						if (i.qq !== 'all' && !i.name) {
							let info
							if (pick.pickMember) info = pick.pickMember(i.qq).info
							else info = Bot[id].pickFriend(i.qq).info
							if (!info) info = await Bot[id].pickUser(i.qq).getSimpleInfo()
							if (info) i.name = info.card || info.nickname
						}
						if (i.name && !i.text) i.text = `${i.name}(${i.qq})`
						break
					case 'markdown':
						forward.push(...(await this.makeMarkdownMsg(id, pick, msg)))
						continue
					case 'button':
						if (config.markdown.button) {
							let rows
							if (i.data) rows = this.makeButtons(id, pick, i.data, true)
							else if (i.content?.rows) rows = i.content.rows
							if (!rows?.length) continue
							if (config.markdown.button === 'direct' || config.markdown.mode === 'mix')
								message.push({
									type: 'button',
									appid: this.markdown_appid,
									content: { rows }
								})
							else if (config.markdown.button === 'separate')
								messages.push([
									{
										type: 'button',
										appid: this.markdown_appid,
										content: { rows }
									}
								])
							else return [await this.makeMarkdownMsg(id, pick, msg)]
						}
						continue
					case 'node':
						for (const node of i.data)
							for (const message of await this.makeMsg(id, pick, node.message))
								forward.push({
									user_id: 80000000,
									nickname: '匿名消息',
									...node,
									type: 'node',
									message
								})
						continue
					case 'raw':
						if (icqq.Converter.prototype.hasOwnProperty(i.data?.type)) i = i.data
						break
					case 'long_msg':
						if (msg.length > 1) continue
						break
					default:
						if (icqq.Converter.prototype.hasOwnProperty(i.type)) {
							messages.push([i])
							continue
						}
						i = Bot.String(i)
				}
			message.push(i)
		}

		if (message.length) messages.push(message)
		if (forward.length) messages.push(forward)
		if (reply) for (const i of messages) i.unshift(reply)
		return messages
	}

	async sendMsg(id, pick, msg, ...args) {
		const rets = { message_id: [], data: [], error: [] }
		let msgs

		const sendMsg = async () => {
			for (const i of msgs)
				try {
					Bot.makeLog('debug', ['发送消息', i], id)
					const ret = await pick.sendMsg(i, ...args)
					Bot.makeLog('debug', ['发送消息返回', ret], id)

					rets.data.push(ret)
					if (ret.message_id) rets.message_id.push(ret.message_id)
				} catch (err) {
					Bot.makeLog('error', ['发送消息错误', i, err], id)
					rets.error.push(err)
					return false
				}
		}

		if (config.markdown.mode) {
			if (config.markdown.mode === 'mix')
				msgs = [...(await this.makeMsg(id, pick, msg)), await this.makeMarkdownMsg(id, pick, msg)]
			else msgs = [await this.makeMarkdownMsg(id, pick, msg)]
		} else {
			msgs = await this.makeMsg(id, pick, msg)
		}

		if ((await sendMsg()) === false) {
			msgs = await this.makeMsg(id, pick, [await Bot.makeForwardMsg([{ message: msg }])])
			await sendMsg()
		}

		if (rets.data.length === 1) return rets.data[0]
		return rets
	}

	async recallMsg(id, pick, message_id) {
		Bot.makeLog('info', `撤回消息：${message_id}`, id)
		if (!Array.isArray(message_id)) message_id = [message_id]
		const msgs = []
		for (const i of message_id) msgs.push(await pick.recallMsg(i))
		return msgs
	}

	getPick(id, pick, target, prop, receiver) {
		switch (prop) {
			case 'sendMsg':
				return this.sendMsg.bind(this, id, pick)
			case 'recallMsg':
				return this.recallMsg.bind(this, id, pick)
			case 'makeForwardMsg':
				return Bot.makeForwardMsg
			case 'sendForwardMsg':
				return async (msg, ...args) => this.sendMsg(id, pick, await Bot.makeForwardMsg(msg), ...args)
			case 'getInfo':
				return () =>
					pick.info ||
					(typeof pick.renew === 'function' && pick.renew()) ||
					(typeof pick.getSimpleInfo === 'function' && pick.getSimpleInfo())
			case 'pickMember':
			case 'asMember':
				return (...args) => {
					for (const i in args) args[i] = Number(args[i]) || args[i]
					const pickMember = pick[prop](...args)
					return new Proxy(
						{},
						{
							get: this.getPick.bind(this, id, pickMember)
						}
					)
				}
			case 'raw':
				return pick
		}
		return target[prop] ?? pick[prop]
	}

	getBot(id, target, prop, receiver) {
		switch (prop) {
			case 'pickUser':
			case 'pickFriend':
			case 'pickGroup':
			case 'pickMember':
				return (...args) => {
					for (const i in args) args[i] = Number(args[i]) || args[i]
					const pick = target.sdk[prop](...args)
					return new Proxy(
						{},
						{
							get: this.getPick.bind(this, id, pick)
						}
					)
				}
		}
		if (prop in target) return target[prop]
		if (typeof target.sdk[prop]?.bind === 'function') return target.sdk[prop].bind(target.sdk)
		return target.sdk[prop]
	}

	makeEvent(data) {
		for (const i of ['friend', 'group', 'member']) {
			if (typeof data[i] !== 'object') continue
			const pick = data[i]
			data[i] = new Proxy(
				{},
				{
					get: this.getPick.bind(this, data.self_id, pick)
				}
			)
		}

		if (data.post_type === 'message')
			try {
				data.raw_message = data.toString()
			} catch (err) {
				Bot.makeLog('error', err, data.self_id)
			}

		if (data.source) {
			if (data.source.seq && data.group?.getChatHistory)
				data.getReply = async () => (await data.group.getChatHistory(data.source.seq, 1))[0]
			else if (data.source.time && data.friend?.getChatHistory)
				data.getReply = async () => (await data.friend.getChatHistory(data.source.time, 1))[0]
		}
	}

	async connect(token, send = Bot.sendMasterMsg.bind(Bot), get) {
		token = token.split(':')
		const id = Number(token.shift())
		const password = token.shift()
		const opts = {
			data_dir: `${process.cwd()}/data/icqq/${id}`,
			cache_group_member: cfg.bot.cache_group_member,
			...config.bot
		}
		const platform = token.shift()
		if (platform) opts.platform = Number(platform)
		const ver = token.shift()
		if (ver) opts.ver = ver
		const sign_api_addr = token.join(':')
		if (sign_api_addr) opts.sign_api_addr = sign_api_addr

		const bot = icqq.createClient(opts)
		const log = {}
		for (const i of ['trace', 'debug', 'info', 'mark', 'warn', 'error', 'fatal'])
			log[i] = (...args) => Bot.makeLog(i, args, id)
		bot.logger = log

		let getTips = '发送 '
		let sendMsg
		if (typeof get !== 'function') {
			getTips += `#Bot验证${id}:`
			get = () =>
				new Promise((resolve) =>
					Bot.once(`verify.${id}`, (data) => {
						send = data.reply
						sendMsg = true
						resolve(data.msg)
					})
				)
		}

		const captchaUrl = 'https://captcha.521002.xyz'

		bot.on('system.login.qrcode', async (data) => {
			Bot.em('system.login.qrcode', data)
			send([`[${id}] 扫码登录`, segment.image(data.image)])
			for (;;) {
				await Bot.sleep(3000)
				const { retcode } = await bot.queryQrcodeResult()
				switch (retcode) {
					case 0:
						return bot.qrcodeLogin()
					case 17:
						return send(`二维码已过期，发送 #Bot上线${id} 重新登录`)
					case 54:
						return send(`登录取消，发送 #Bot上线${id} 重新登录`)
				}
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
				return send(`滑动验证错误，发送 #Bot上线${id} 重新登录`)
			}

			const params = new URL(data.url).searchParams
			const url = new URL(captchaUrl)
			url.searchParams.set('aid', params.get('aid') || '')
			url.searchParams.set('login_appid', params.get('login_appid') || '')
			url.searchParams.set('sid', params.get('sid') || '')
			url.searchParams.set('uin', id)
			send(`[${id}] 请打开下方链接完成滑动验证\n${url}`)

			try {
				for (let i = 0; i < 60; i++) {
					await Bot.sleep(3000)
					const res = await (await fetch(api, { method: 'POST' })).json()
					Bot.makeLog('debug', ['Ticket', res], id)
					if (res.status === 'ready') {
						const ticket = res.result?.ticket
						const randstr = res.result?.randstr ?? res.result?.randStr
						if (ticket && randstr) return bot.submitSlider(`${ticket},${randstr}`)
					}
					if (res.status !== 'pending') Bot.makeLog('warn', ['验证状态错误', res], id)
				}
			} catch (err) {
				Bot.makeLog('error', ['验证请求错误', err], id)
				return send(`滑动验证错误，发送 #Bot上线${id} 重新登录`)
			}
			return send(`滑动验证超时，发送 #Bot上线${id} 重新登录`)
		})

		bot.on('system.login.device', async (data) => {
			Bot.em('system.login.device', data)
			send(
				`[${id}] 触发设备验证\n` +
					`请在QQ内点击下方链接完成验证, 复制到浏览器无效\n` +
					`通过验证后${getTips}继续登录\n\n` +
					data.url
			)
			for (;;) {
				if ((await get()) === '继续登录') {
					bot.login()
					break
				}
			}
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
				return send(`[${id}] 登录验证错误，发送 #Bot上线${id} 重新登录`)
			}

			send(`[${id}] 请打开下方链接完成登录验证\n${api}`)
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
				return send(`[${id}] 登录验证错误，发送 #Bot上线${id} 重新登录`)
			}
			return send(`[${id}] 登录验证超时，发送 #Bot上线${id} 重新登录`)
		})

		bot.on('system.login.error', (data) => {
			Bot.em('system.login.error', data)
			send(`[${id}] 登录错误：${data.message}(${data.code})\n` + `发送 #Bot上线${id} 重新登录`)
		})
		bot.on('system.offline', (data) => {
			const i = Bot.uin.indexOf(id)
			if (i !== -1) Bot.uin.splice(i, 1)
			Bot.em('system.offline', data)
			send(`[${id}] 账号下线：${data.message}\n` + `发送 #Bot上线${id} 重新登录`)
		})
		bot.on('system.online', async (data) => {
			Bot.em('system.online', data)
			bot.logger = log
			if (sendMsg) send(`[${id}] 登录完成`)
			Bot.em(`connect.${id}`, { self_id: id })
			if (bot.sig?.sign_api_addr)
				try {
					const url = new URL(bot.sig.sign_api_addr)
					if (!url.pathname.endsWith('/')) url.pathname += '/'
					url.pathname += 'cmd_whitelist'
					url.searchParams.set('ver', bot.apk.ver)
					url.searchParams.set('fekit_ver', bot.apk.fekit_ver ?? '')
					url.searchParams.set('uin', bot.uin ?? 0)
					const res = await (await fetch(url)).json()
					if (res?.data?.list?.length > 0) {
						bot.signCmd = res.data.list
						Bot.makeLog('debug', [`cmd_whitelist 已更新`, bot.signCmd], id)
					}
				} catch (err) {
					Bot.makeLog('debug', ['cmd_whitelist 获取失败', err], id)
				}
		})

		Bot[id] = new Proxy(
			{
				adapter: this,
				sdk: bot,
				icqq,
				avatar: bot.pickFriend(id).getAvatarUrl(),
				version: {
					id: this.id,
					name: this.name,
					version: this.version
				}
			},
			{
				get: this.getBot.bind(this, id)
			}
		)
		await new Promise((resolve) => {
			bot.once('system.online', resolve)
			bot.login(id, password)
		})

		bot.on('message', (data) => {
			this.makeEvent(data)
			Bot.em(`${data.post_type}.${data.message_type}.${data.sub_type}`, data)
		})

		bot.on('notice', (data) => {
			this.makeEvent(data)
			Bot.em(`${data.post_type}.${data.notice_type}.${data.sub_type}`, data)
		})

		bot.on('request', (data) => {
			this.makeEvent(data)
			Bot.em(`${data.post_type}.${data.request_type}.${data.sub_type}`, data)
		})

		for (const i of ['internal.input', 'sync'])
			bot.on(i, (data) => {
				data.self_id = id
				Bot.em(i, data)
			})

		Bot.makeLog('mark', `${this.name}(${this.id}) ${this.version} 已连接`, id)
		return true
	}

	async load() {
		for (const token of config.token) await Bot.sleep(5000, this.connect(token))
	}
})()

Bot.adapter.push(adapter)

export class ICQQAdapter extends plugin {
	constructor() {
		super({
			name: 'ICQQAdapter',
			dsc: 'ICQQ 适配器设置',
			event: 'message',
			rule: [
				{
					reg: '^#[Qq]+账号$',
					fnc: 'List',
					permission: config.permission
				},
				{
					reg: '^#[Qq]+设置[0-9]+',
					fnc: 'Token',
					permission: config.permission
				},
				{
					reg: '^#[Qq]+签名.+$',
					fnc: 'SignUrl',
					permission: config.permission
				}
			]
		})
	}

	List() {
		this.reply(`共${config.token.length}个账号：\n${config.token.join('\n')}`, true)
	}

	async Token() {
		const token = this.e.msg.replace(/^#[Qq]+设置/, '').trim()
		if (config.token.includes(token)) {
			config.token = config.token.filter((item) => item !== token)
			this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
		} else {
			if (await adapter.connect(token, (msg) => this.reply(msg, true), Bot.getTextMsg.bind(Bot, this.e))) {
				config.token.push(token)
				this.reply(`账号已连接，共${config.token.length}个账号`, true)
			} else {
				this.reply('账号连接失败', true)
				return false
			}
		}
		await configSave()
	}

	async SignUrl() {
		config.bot.sign_api_addr = this.e.msg.replace(/^#[Qq]+签名/, '').trim()
		await configSave()
		this.reply('签名已设置，重启后生效', true)
	}
}

logger.info(logger.green('- ICQQ 适配器插件 加载完成'))
