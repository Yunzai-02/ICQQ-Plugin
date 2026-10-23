logger.info(logger.yellow('- 正在加载 ICQQ 适配器插件'))

import { ICQQAdapter as Adapter } from './lib/adapter.js'
import { config, configSave } from './lib/config.js'

const adapter = new Adapter()
Bot.adapter.push(adapter)

/** 从签名地址获取不带 ver 的全量命令白名单 */
async function fetchFullCmdWhitelist(addr) {
	const url = new URL(addr.includes('://') ? addr : `http://${addr}`)
	url.pathname = url.pathname.replace(/\/?$/, '/').replace(/(?:sign|ws)\/$/, '') + 'cmd_whitelist'

	const response = await fetch(url, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(15000)
	})
	if (!response.ok) throw new Error(`签名服务请求失败：HTTP ${response.status}`)

	const { code, msg, data } = await response.json()
	if (Number(code) !== 0 || !data?.list?.length) throw new Error(msg || '签名服务未返回白名单')

	const list = data.list.map((cmd) => String(cmd).trim()).filter(Boolean)
	if (!list.length) throw new Error('签名服务返回的白名单为空')
	return [...new Set(list)]
}

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
				},
				{
					reg: '^#[Qq]+(?:更新|刷新)?白名单$',
					fnc: 'Whitelist',
					permission: config.permission
				}
			]
		})
	}

	/** 查看已保存的账号 */
	List() {
		this.reply(`共${config.token.length}个账号：\n${config.token.join('\n')}`, true)
	}

	/** 添加或删除账号 */
	async Token() {
		const token = this.e.msg.replace(/^#[Qq]+设置/, '').trim()

		if (config.token.includes(token)) {
			config.token = config.token.filter((item) => item !== token)
			this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true)
		} else {
			const send = (msg) => this.reply(msg, true)
			const get = Bot.getTextMsg.bind(Bot, this.e)
			if (!(await adapter.connect(token, send, get))) {
				this.reply('账号连接失败', true)
				return false
			}
			config.token.push(token)
			this.reply(`账号已连接，共${config.token.length}个账号`, true)
		}

		await configSave()
	}

	/** 设置签名服务器地址 */
	async SignUrl() {
		config.bot.sign_api_addr = this.e.msg.replace(/^#[Qq]+签名/, '').trim()
		await configSave()
		this.reply('签名已设置，重启后生效', true)
	}

	/** 从签名地址获取全量白名单并完整替换所有已连接账号 */
	async Whitelist() {
		if (!adapter.clients.size) return this.reply('当前没有已连接的 ICQQ 账号', true)

		const cache = new Map()
		const result = await Promise.all(
			[...adapter.clients].map(async ([id, { bot }]) => {
				const addr = bot.sig?.sign_api_addr
				if (!addr) return `[${id}] 未配置签名地址`

				try {
					cache.set(addr, cache.get(addr) ?? fetchFullCmdWhitelist(addr))
					const list = await cache.get(addr)
					bot.signCmd = list
					return `[${id}] 白名单已完整替换：${list.length} 条`
				} catch (err) {
					Bot.makeLog('error', ['更新白名单失败', err], id)
					return `[${id}] 更新失败：${err.message}`
				}
			})
		)

		this.reply(result.join('\n'), true)
	}
}

logger.info(logger.green('- ICQQ 适配器插件 加载完成'))
