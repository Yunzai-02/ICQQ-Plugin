logger.info(logger.yellow('- 正在加载 ICQQ 适配器插件'))

import { ICQQAdapter as Adapter } from './lib/adapter.js'
import { config, configSave } from './lib/config.js'

const adapter = new Adapter()
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
}

logger.info(logger.green('- ICQQ 适配器插件 加载完成'))
