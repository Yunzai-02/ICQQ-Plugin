import { ulid } from 'ulid'
import { config } from './config.js'

/** 按钮回调缓存时长（毫秒） */
const CALLBACK_TTL = 3600000

/** 查找可桥接按钮回调的 QQBot 适配器 */
function findQQBot() {
	for (const id of Bot.uin) {
		const bot = Bot[id]
		const appid = bot?.sdk?.config?.appid
		if (appid && bot.adapter?.id === 'QQBot' && bot.callback)
			return { appid, store: bot.callback }
	}
}

/** 写入 QQBot 回调缓存，返回按钮所属的 appid */
function bridgeCallback(self_id, pick, id, message) {
	const target = findQQBot()
	if (!target) return

	const { appid, store } = target
	const value = {
		self_id,
		user_id: pick.user_id,
		group_id: pick.group_id,
		message
	}

	if (typeof store.set === 'function') store.set(id, value)?.catch?.(() => {})
	else store[id] = value

	setTimeout(() => {
		if (typeof store.delete === 'function') store.delete(id)?.catch?.(() => {})
		else delete store[id]
	}, CALLBACK_TTL).unref?.()

	return Number(appid)
}

/** 构造单个按钮，返回 { msg, appid } */
function makeButton({ self_id, pick, button, style, forward }) {
	let action
	if (button.link) action = { type: 0, data: button.link }
	else if (button.input) action = { type: 2, data: button.input, enter: button.send }
	else if (button.callback) action = { type: 2, data: button.callback, enter: true }
	else return

	const msg = {
		id: ulid(),
		render_data: {
			label: button.text,
			visited_label: button.clicked_text,
			style,
			...button.QQBot?.render_data
		},
		action: {
			permission: { type: 2 },
			...action,
			...button.QQBot?.action
		}
	}

	if (button.permission) {
		if (button.permission === 'admin') msg.action.permission.type = 1
		else {
			msg.action.permission.type = 0
			msg.action.permission.specify_user_ids = String(button.permission)
		}
	}

	if (forward && config.markdown.callback && (button.input || button.callback)) {
		const appid = bridgeCallback(self_id, pick, msg.id, button.input || button.callback)
		if (appid) {
			msg.action.type = 1
			delete msg.action.data
			return { msg, appid }
		}
	}

	return { msg }
}

/** 构造按钮行，返回 { rows, appid } */
export function makeButtons({ self_id, pick, rows, forward = false }) {
	const result = []
	let appid

	for (const [row_index, row] of rows.entries()) {
		const buttons = []
		for (const [column, button] of row.entries()) {
			const built = makeButton({
				self_id,
				pick,
				button,
				style: (row_index + column) % 2,
				forward
			})
			if (!built) continue
			appid ??= built.appid
			buttons.push(built.msg)
		}
		if (buttons.length) result.push({ buttons })
	}

	return { rows: result, appid }
}
