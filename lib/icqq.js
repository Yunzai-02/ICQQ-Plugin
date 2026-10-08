import { createRequire } from 'node:module'
import * as icqq from 'icqq'
import { config } from './config.js'

function font_id() {
	try {
		const { rich } = new icqq.Converter(null, ' ')
		const reserver = rich[2].find((e) => e?.[37]?.[19])
		if (reserver) reserver[37][19][15] = config.bot?.font_id ?? 0
	} catch (err) {
		logger.error('[ICQQ-Plugin] font_id:', err.message)
	}
}

font_id()

/** icqq 包版本 */
export const version = createRequire(import.meta.url)('icqq/package.json').version

/** 是否为 icqq 支持的消息元素类型 */
export const isElemType = (type) => Object.prototype.hasOwnProperty.call(icqq.Converter.prototype, type)

export default icqq
