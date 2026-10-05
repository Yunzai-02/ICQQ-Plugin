import { createRequire } from 'node:module'
import * as icqq from 'icqq'

/** icqq 包版本 */
export const version = createRequire(import.meta.url)('icqq/package.json').version

/** 是否为 icqq 支持的消息元素类型 */
export const isElemType = (type) => Object.prototype.hasOwnProperty.call(icqq.Converter.prototype, type)

export default icqq
