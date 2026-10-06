import cfg from '../../../lib/config/config.js'
import icqq, { version as icqqVersion } from './icqq.js'
import { config } from './config.js'
import { setupLogin } from './login.js'
import { sendMsg, recallMsg, makeMsg } from './message.js'
import { createStatusNotifier } from './notify.js'

const toNumbers = (args) => args.map((i) => Number(i) || i)

/** 将 icqq 日志转发到云崽日志 */
function makeLogger(id) {
	const logger = {}
	for (const level of ['trace', 'debug', 'info', 'mark', 'warn', 'error', 'fatal'])
		logger[level] = (...args) => Bot.makeLog(level, args, id)
	return logger
}

export class ICQQAdapter {
	id = 'QQ'
	name = 'ICQQ'
	path = 'ICQQ'
	version = `v${icqqVersion}`
	clients = new Map()
	notifyError = (err) => Bot.makeLog('error', ['发送状态通知错误', err])

	constructor() {
		this.notifier = createStatusNotifier((msg) => Bot.sendMasterMsg(msg), config.reconnect, this.notifyError)
	}

	async load() {
		for (const token of config.token) await Bot.sleep(5000, this.connect(token))
	}

	async connect(token, sendToMaster, get) {
		const [uin, password, platform, ver, ...sign] = String(token).split(':')
		const id = Number(uin)
		const opts = {
			data_dir: `${process.cwd()}/data/icqq/${id}`,
			cache_group_member: cfg.bot.cache_group_member,
			...config.bot
		}
		if (platform) opts.platform = Number(platform)
		if (ver) opts.ver = ver
		if (sign.length) opts.sign_api_addr = sign.join(':')

		const old = this.clients.get(id)
		if (old) {
			Bot.makeLog('warn', ['账号重复连接，断开旧连接后重新登录'], id)
			old.reconnect.stop('重复连接')
			await Bot.sleep(
				3000,
				Promise.resolve(old.bot.logout()).catch(() => {})
			)
			old.bot.terminate()
		}

		const bot = icqq.createClient(opts)
		const logger = makeLogger(id)
		bot.logger = logger
		const send = sendToMaster || Bot.sendMasterMsg.bind(Bot)
		const notify = sendToMaster
			? createStatusNotifier(send, { notify_interval: 0 }, this.notifyError).notify
			: this.notifier.notify

		const reconnect = setupLogin(bot, { id, password, send, notify, get, logger })
		this.clients.set(id, { bot, reconnect })

		Bot[id] = new Proxy(this.makeBot(id, bot), { get: this.getBot.bind(this, id) })

		bot.login(id, password).catch((err) => Bot.makeLog('error', ['登录错误', err], id))
		await new Promise((resolve) => bot.once('system.online', resolve))

		for (const [event, type] of [
			['message', 'message'],
			['notice', 'notice'],
			['request', 'request']
		])
			bot.on(event, (data) => {
				this.makeEvent(data)
				Bot.em(`${data.post_type}.${data[type + '_type']}.${data.sub_type}`, data)
			})

		for (const event of ['internal.input', 'sync'])
			bot.on(event, (data) => {
				data.self_id = id
				Bot.em(event, data)
			})

		Bot.makeLog('mark', `${this.name}(${this.id}) ${this.version} 已连接`, id)
		return true
	}

	makeBot(id, sdk) {
		return {
			adapter: this,
			sdk,
			icqq,
			avatar: sdk.pickFriend(id).getAvatarUrl(),
			version: {
				id: this.id,
				name: this.name,
				version: this.version
			}
		}
	}

	wrapPick(id, pick) {
		return new Proxy({}, { get: (_, prop) => this.getPick(id, pick, prop) })
	}

	getPick(id, pick, prop) {
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
				return () => pick.info ?? pick.renew?.() ?? pick.getSimpleInfo?.()
			case 'pickMember':
			case 'asMember':
				return (...args) => this.wrapPick(id, pick[prop](...toNumbers(args)))
			case 'raw':
				return pick
		}
		return pick[prop]
	}

	getBot(id, target, prop) {
		switch (prop) {
			case 'pickUser':
			case 'pickFriend':
			case 'pickGroup':
			case 'pickMember':
				return (...args) => this.wrapPick(id, target.sdk[prop](...toNumbers(args)))
		}
		if (prop in target) return target[prop]

		const value = target.sdk[prop]
		return typeof value?.bind === 'function' ? value.bind(target.sdk) : value
	}

	makeEvent(data) {
		for (const key of ['friend', 'group', 'member']) {
			const pick = data[key]
			if (!pick || typeof pick !== 'object') continue
			data[key] = this.wrapPick(data.self_id, pick)
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

	makeMsg(id, pick, msg) {
		return makeMsg(id, pick, msg)
	}

	sendMsg(id, pick, msg, ...args) {
		return sendMsg(id, pick, msg, ...args)
	}

	recallMsg(id, pick, message_id) {
		return recallMsg(id, pick, message_id)
	}
}
