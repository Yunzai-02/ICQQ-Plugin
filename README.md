<div align="center">

# TRSS-Yunzai ICQQ Plugin

TRSS-Yunzai ICQQ Bot 适配器 插件

[![访问量](https://visitor-badge.glitch.me/badge?page_id=TimeRainStarSky.Yunzai-ICQQ-Plugin&right_color=red&left_text=访%20问%20量)](https://github.com/TimeRainStarSky/Yunzai-ICQQ-Plugin)
[![Stars](https://img.shields.io/github/stars/TimeRainStarSky/Yunzai-ICQQ-Plugin?color=yellow&label=收藏)](../../stargazers)
[![Downloads](https://img.shields.io/github/downloads/TimeRainStarSky/Yunzai-ICQQ-Plugin/total?color=blue&label=下载)](../../archive/main.tar.gz)
[![Releases](https://img.shields.io/github/v/release/TimeRainStarSky/Yunzai-ICQQ-Plugin?color=green&label=发行版)](../../releases/latest)

[![访问量](https://profile-counter.glitch.me/TimeRainStarSky-Yunzai-ICQQ-Plugin/count.svg)](https://github.com/TimeRainStarSky/Yunzai-ICQQ-Plugin)

</div>

## 安装教程

1. 准备：[TRSS-Yunzai](../../../Yunzai)
2. 输入：`#安装ICQQ-Plugin`
3. 输入：`#QQ签名[签名服务器地址]`
4. 输入：`#QQ设置QQ号:密码:登录设备`

## 安装 ICQQ

```sh
cd plugins/ICQQ-Plugin

pnpm add icqq@npm:@icqqjs/icqq
```

## 格式示例

- 密码登录：QQ号 `114514` 密码 `1919810` 登录设备 `安卓手机(1)/平板(2)`

```
#QQ设置114514:1919810:2
```

- 扫码登录：QQ号 `114514` 登录设备 `安卓手表(3)`

```
#QQ设置114514::3
```

## 使用教程

- #QQ账号
- #QQ设置 + `QQ号:密码(留空扫码):登录设备:版本号:独立签名地址`
- #QQ签名 + `签名服务器地址`

## 配置项

配置文件：`config/ICQQ.yaml`

- `reconnect.enable`：掉线自动重连开关，默认 `true`
- `reconnect.kickoff`：被踢下线时是否自动重连，默认 `true`（其他设备登录会互相顶号）
- `reconnect.interval`：首次重连等待秒数，之后指数递增，默认 `5`
- `reconnect.max_interval`：重连等待上限秒数，默认 `300`
- `reconnect.max_attempts`：主动重连次数上限，`0` 为不限，默认 `0`
- `reconnect.notify_interval`：批量状态通知合并窗口秒数，`0` 为不合并，默认 `10`
