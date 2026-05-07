package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mynav/websource"
	"net/http"
	"os"
	"path"
	"strconv"
	"sync"
	"time"

	assetfs "github.com/elazarl/go-bindata-assetfs"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// 获取程序所在目录
func getProgramDir() string {
	exePath, err := os.Executable()
	if err != nil {
		return "."
	}
	return path.Dir(exePath)
}

// 获取配置文件路径（程序所在目录/config/config.json）
func getConfigFile() string {
	return path.Join(getProgramDir(), "config", "config.json")
}

// 获取端口配置，优先使用环境变量 PORT，默认 8080
func getPort() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	// 验证端口是否为有效数字
	if _, err := strconv.Atoi(port); err != nil {
		fmt.Printf("警告: 环境变量 PORT 的值 '%s' 无效，使用默认端口 8080\n", port)
		port = "8080"
	}
	return port
}

// SSE 客户端管理
type SSEManager struct {
	clients map[chan string]bool
	mutex   sync.Mutex
}

var sseManager = &SSEManager{
	clients: make(map[chan string]bool),
}

func (m *SSEManager) AddClient(ch chan string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.clients[ch] = true
}

func (m *SSEManager) RemoveClient(ch chan string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	delete(m.clients, ch)
	close(ch)
}

func (m *SSEManager) Broadcast(message string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	for ch := range m.clients {
		select {
		case ch <- message:
		default:
			// 如果客户端接收缓慢，跳过
		}
	}
}

func main() {
	// 创建 Echo 实例
	e := echo.New()

	// 禁用 banner 显示
	e.HideBanner = true
	e.HidePort = true // 禁用端口日志输出

	// 自定义错误处理中间件，捕获并记录程序错误
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			defer func() {
				if r := recover(); r != nil {
					fmt.Printf("错误: 程序发生panic: %v\n", r)
				}
			}()
			return next(c)
		}
	})

	// 中间件
	e.Use(middleware.CORS())

	// SSE 端点 - 实时配置更新
	e.GET("/events", func(c echo.Context) error {
		// 设置 SSE 头
		c.Response().Header().Set("Content-Type", "text/event-stream")
		c.Response().Header().Set("Cache-Control", "no-cache")
		c.Response().Header().Set("Connection", "keep-alive")
		c.Response().Header().Set("Access-Control-Allow-Origin", "*")

		// 创建客户端通道
		messageChan := make(chan string, 10)
		sseManager.AddClient(messageChan)
		defer sseManager.RemoveClient(messageChan)

		// 保持连接并发送消息
		for {
			select {
			case msg := <-messageChan:
				fmt.Fprintf(c.Response(), "data: %s\n\n", msg)
				c.Response().Flush()
			case <-time.After(30 * time.Second):
				// 每30秒发送心跳
				fmt.Fprintf(c.Response(), ": heartbeat\n\n")
				c.Response().Flush()
			}
		}
	})

	// API 端点 - 获取配置
	e.GET("/api/config", func(c echo.Context) error {
		configFile := getConfigFile()

		// 如果配置文件不存在，创建默认配置
		if _, err := os.Stat(configFile); os.IsNotExist(err) {
			defaultConfig := map[string]interface{}{
				"siteTitle":        "GVia",
				"searchTitle":      "搜索",
				"searchEngine":     "baidu",
				"showTitle":        true,
				"showSearch":       true,
				"showGroupDivider": true,
				"bgBlur":           "0",
				"blur":             "0",
				"wallpaper":        "wallpaper/012.jpg",
				"groups":           []interface{}{},
				"contextMenu":      []interface{}{},
			}
			data, _ := json.MarshalIndent(defaultConfig, "", "  ")
			os.MkdirAll(path.Dir(configFile), 0755)
			os.WriteFile(configFile, data, 0644)
			fmt.Printf("信息: 已创建默认配置文件: %s\n", configFile)
		}

		// 读取配置文件
		data, err := os.ReadFile(configFile)
		if err != nil {
			fmt.Printf("错误: 读取配置文件失败: %s\n", err.Error())
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "配置文件不存在",
			})
		}

		// 返回配置数据
		var config map[string]interface{}
		if err := json.Unmarshal(data, &config); err != nil {
			fmt.Printf("错误: 解析配置文件失败: %s\n", err.Error())
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "配置文件格式错误",
			})
		}

		fmt.Println("成功: 读取配置")
		return c.JSON(http.StatusOK, config)
	})

	// API 端点 - 保存配置
	e.POST("/api/config", func(c echo.Context) error {
		// 读取请求体
		var config map[string]interface{}
		if err := c.Bind(&config); err != nil {
			fmt.Printf("错误: 解析请求数据失败: %s\n", err.Error())
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "无效的请求数据",
			})
		}

		// 确保 config 目录存在
		configDir := path.Join(getProgramDir(), "config")
		if err := os.MkdirAll(configDir, 0755); err != nil {
			fmt.Printf("错误: 创建配置目录失败: %s\n", err.Error())
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "创建配置目录失败",
			})
		}

		// 将数据写入配置文件
		configFile := getConfigFile()
		data, err := json.MarshalIndent(config, "", "  ")
		if err != nil {
			fmt.Printf("错误: 序列化配置失败: %s\n", err.Error())
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "序列化配置失败",
			})
		}

		if err := os.WriteFile(configFile, data, 0644); err != nil {
			fmt.Printf("错误: 保存配置文件失败: %s\n", err.Error())
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "保存配置文件失败",
			})
		}

		// 广播配置更新消息给所有连接的客户端
		sseManager.Broadcast("config_updated")
		fmt.Println("成功: 配置已修改并保存")

		return c.JSON(http.StatusOK, map[string]string{
			"message": "配置保存成功",
		})
	})

	// 静态路由必须后注册，以确保动态路由优先级优先级更高
	// 优先加载本地 www 目录，如果不存在则使用编译的静态资源
	LoadWebSource(e)

	// 打印配置文件路径
	fmt.Printf("配置文件路径: %s\n", getConfigFile())

	//启动http server, 并监听配置端口，冒号（:）前面为空的意思就是绑定网卡所有Ip地址，本机支持的所有ip地址都可以访问。
	go initWebServerHTTP(e)

	e.Logger.SetOutput(io.Discard) // 禁用 Echo 默认日志输出
	fmt.Printf("服务运行于: %s\n", getPort())

	// 永久阻塞，确保服务器不退出
	select {}
}

func StaticAssets(root string) *assetfs.AssetFS {
	return &assetfs.AssetFS{
		Asset:     websource.Asset,
		AssetDir:  websource.AssetDir,
		AssetInfo: websource.AssetInfo,
		Prefix:    root,
	}
}

func initWebServerHTTP(mainWeb *echo.Echo) { // 初始化WEB控制台服务
	addr := "0.0.0.0:" + getPort()
	if err := mainWeb.Start(addr); err != nil {
		fmt.Printf("错误: HTTP服务: %s\n", err.Error())
	}
}

func LoadWebSource(e *echo.Echo) {
	// 静态文件处理器（不需要使用 e.Group("/*")，直接在根实例 e 上操作）
	if _, err := os.Stat("www"); err == nil {
		e.Static("/", "www")
	} else {
		// 【静态数据模式】
		assetHandler := http.FileServer(StaticAssets("/www/"))
		e.GET("/*", echo.WrapHandler(assetHandler))
	}
}
