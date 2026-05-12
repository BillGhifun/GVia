# GVia - 个人导航页面

一个简洁优雅的个人导航页面系统，基于 Go + Echo 框架开发，支持动态配置和实时更新。

<div align="center">
  <img src="pic/main.png" alt="预览图" width="800">
</div>

## 功能特性

- 🔐 **用户认证系统** - 支持多用户管理、登录/登出、密码修改
- 📚 **链接分组管理** - 支持将书签按分组管理，自定义图标和描述
- 🔍 **搜索引擎集成** - 支持 Google、Bing、百度等多种搜索引擎自由切换
- 🎨 **自定义壁纸** - 支持设置背景壁纸，内置 15 张精美壁纸
- ⚙️ **动态配置** - 通过 API 动态修改配置，实时生效（SSE 推送）
- 📱 **响应式设计** - 适配各种屏幕尺寸，支持深色/浅色背景
- 🚀 **单文件部署** - 支持将静态资源编译到二进制文件中
- 🔗 **右键快捷菜单** - 支持自定义右键菜单快捷方式
- ✏️ **拖拽排序** - 支持拖拽调整卡片和分组顺序
- 🔄 **实时同步** - 多端配置自动同步更新
- 👥 **权限分离** - 未登录用户只读模式，已登录用户可编辑

## 项目结构

```
GVia/
├── main.go              # 主程序入口
├── go.mod               # Go 模块依赖
├── Dockerfile           # Docker 构建文件
├── docker-compose.yml   # Docker Compose 编排文件
├── bin/                 # 预编译二进制文件
│   ├── GVia_amd64      # AMD64 架构
│   ├── GVia_arm64      # ARM64 架构
│   └── GVia_arm        # ARM 架构
├── config/              # 配置目录（首次运行自动生成）
│   ├── config.json      # 导航配置文件
│   └── auth.json        # 用户认证配置
├── www/                 # 前端静态资源
│   ├── index.html       # 主页面
│   ├── css/             # 样式文件
│   ├── js/              # JavaScript 脚本
│   ├── font/            # 字体文件
│   ├── pic/             # 图片资源
│   └── wallpaper/       # 壁纸图片 (001.jpg - 015.jpg)
└── websource/           # 编译后的静态资源（用于嵌入）
```

## 快速开始

### 方式一：直接运行

```bash
# 克隆项目
git clone https://github.com/ghifun/gvia.git
cd gvia

# 运行（默认端口 8080）
go run main.go
```

> 首次运行会自动生成 `config/` 目录，包含：
> - `config.json` - 默认导航配置
> - `auth.json` - 默认认证配置（admin / admin123）
>
> 运行后访问 http://localhost:8080 ，点击右上角锁图标登录即可开始使用。

### 方式二：使用预编译二进制

```bash
# 下载对应架构的二进制文件
chmod +x bin/GVia_amd64
./bin/GVia_amd64
```

### 方式三：Docker 部署

#### 前置条件
- 确保已安装 Docker 和 Docker Compose
- 确保已编译对应架构的二进制文件：`GVia_amd64`、`GVia_arm64` 或 `GVia_arm`

#### 使用 docker-compose

```bash
# 首次启动或重新创建容器
docker build -t gvia . && docker-compose up -d
```

<details>
<summary><strong>在已有容器需要更新情况下：</strong></summary>

```bash
docker build -t gvia . && docker stop gvia || true && docker rm gvia || true && docker-compose up -d
```

</details>

## 配置说明

### 认证配置（auth.json）

> ⚠️ **重要**：首次启动程序时会**自动生成** `config/auth.json`，默认账号密码如下：
>
> | 用户名 | 密码 |
> |--------|------|
> | `admin` | `admin123` |
>
> **请务必在首次登录后修改默认密码！**

配置文件结构：
```json
{
  "users": [
    {
      "username": "admin",
      "password": "your_password"
    }
  ]
}
```

### 导航配置（config.json）

配置文件支持以下选项：

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `siteTitle` | string | 网站标题（浏览器标签） |
| `searchTitle` | string | 搜索框标题文字 |
| `searchEngine` | string | 默认搜索引擎（google/bing/baidu） |
| `wallpaper` | string | 背景壁纸路径 |
| `blur` | number | 磨砂模糊度 (0-30) |
| `bgBlur` | number | 背景壁纸模糊度 (0-50) |
| `cardBorderOpacity` | number | 卡片边框透明度 (0-100) |
| `searchBorderOpacity` | number | 搜索框边框透明度 (0-100) |
| `showTitle` | boolean | 是否显示标题 |
| `showSearch` | boolean | 是否显示搜索框 |
| `showGroupDivider` | boolean | 是否显示分组分隔线 |
| `showAuthorButton` | boolean | 是否显示作者按钮 |
| `groups` | array | 链接分组配置 |
| `contextMenu` | array | 右键菜单配置 |
| `faviconApi` | string | Favicon API 地址（{link} 为占位符） |

### 分组配置示例

```json
{
  "groups": [
    {
      "title": "常用工具",
      "icon": "fas fa-star",
      "id": "g-001",
      "links": [
        {
          "title": "GitHub",
          "url": "https://github.com",
          "icon": "https://github.com/favicon.ico",
          "desc": "代码托管平台"
        },
        {
          "title": "Google",
          "url": "https://google.com",
          "icon": "fas fa-search",
          "desc": "搜索引擎"
        }
      ]
    }
  ]
}
```

### 右键菜单配置示例

```json
{
  "contextMenu": [
    { "title": "添加分组", "icon": "fas fa-plus", "url": "" },
    { "type": "divider" },
    { "title": "刷新", "icon": "fas fa-redo", "url": "javascript:location.reload()" }
  ]
}
```

## API 接口

### 认证接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/login` | POST | 用户登录（返回 session） |
| `/api/logout` | POST | 用户登出（清除 session） |
| `/api/check-session` | GET | 检查登录状态 |
| `/api/password` | POST | 修改密码（需登录） |
| `/api/users` | GET | 获取用户列表（需登录） |
| `/api/users` | POST | 添加用户（需登录） |

### 配置接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET | 获取当前配置 |
| `/api/config` | POST | 保存配置（JSON 格式，需登录） |
| `/events` | GET | SSE 实时推送配置更新 |
| `/` | GET | 首页 |

### 权限说明

- **未登录用户**：只读模式，可查看页面和配置，无法修改
- **已登录用户**：完整权限，可编辑配置、管理用户等

### API 使用示例

```bash
# 登录获取 session
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 检查登录状态
curl http://localhost:8080/api/check-session -b "session_id=xxx"

# 获取配置（无需登录）
curl http://localhost:8080/api/config

# 保存配置（需要先登录）
curl -X POST http://localhost:8080/api/config \
  -H "Content-Type: application/json" \
  -H "Cookie: session_id=xxx" \
  -d '{"siteTitle":"我的导航","wallpaper":"/wallpaper/005.jpg"}'

# 登出
curl -X POST http://localhost:8080/api/logout -b "session_id=xxx"
```

## 界面设置

系统支持在页面右上角设置按钮中直接调整以下选项：

- **外观设置**（登录后可用）
  - 壁纸链接（支持本地路径或 URL）
  - 磨砂模糊度
  - 背景壁纸模糊度
  - 卡片边框透明度
  - 搜索框边框透明度

- **通用设置**（登录后可用）
  - 网站标题 / 图标
  - Favicon API
  - 主标题名称
  - 显示/隐藏标题、搜索栏、分组分割线、作者按钮

- **账户管理**（登录后可用）
  - 修改密码
  - 添加/管理用户

- **右键菜单**
  - 自定义右键快捷方式
  - 添加/删除分割线
  - 未登录时仅显示快捷方式、刷新、全屏

## 技术栈

- **后端**: Go + [Echo v4](https://echo.labstack.com/)
- **前端**: 原生 HTML/CSS/JavaScript
- **认证**: Cookie-based Session（服务端内存存储，7天过期）
- **图标**: Font Awesome 6
- **实时通信**: Server-Sent Events (SSE)
- **容器化**: Docker + Docker Compose

## 主要依赖

- `github.com/labstack/echo/v4` - Web 框架
- `github.com/elazarl/go-bindata-assetfs` - 静态资源嵌入

## 编译静态资源

如需将前端资源编译到二进制文件中：

```bash
# 安装 go-bindata
go install github.com/elazarl/go-bindata-assetfs/...

# 编译资源
go generate ./...

# 重新编译二进制
go build -o GVia_amd64 main.go
```

## 许可证

[MIT License](LICENSE)

## 作者

[BillGhifun](https://github.com/billghifun)

---

⭐ 如果你觉得这个项目对你有帮助，欢迎 Star！

## 壁纸版权声明

> ⚠️ **特别注明**：内置壁纸中 **001.jpg、003.jpg、005.jpg、008.jpg、009.jpg** 的版权属于本项目作者 **BillGhifun**，未经授权不可用于其他项目或商业用途。其他壁纸素材来源于互联网，仅供个人学习使用。

## 致谢

- [Font Awesome](https://fontawesome.com/) - 图标库
- [Echo Framework](https://echo.labstack.com/) - Go Web 框架
- 部分图片素材来源于互联网，仅供个人学习使用
