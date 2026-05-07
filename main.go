package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mynav/websource"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	assetfs "github.com/elazarl/go-bindata-assetfs"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Config struct {
	Data map[string]interface{} `json:"data"`
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
		configFile := filepath.Join(".", "config.json")

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

		// 将数据写入配置文件
		configFile := filepath.Join(".", "config.json")
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

	// 静态路由必须后注册，以确保动态路由优先级更高
	// 优先加载本地 www 目录，如果不存在则使用编译的静态资源
	LoadWebSource(e)

	//启动http server, 并监听8080端口，冒号（:）前面为空的意思就是绑定网卡所有Ip地址，本机支持的所有ip地址都可以访问。
	go initWebServerHTTP(e)

	e.Logger.SetOutput(io.Discard) // 禁用 Echo 默认日志输出
	fmt.Println("服务运行于: 0.0.0.0:8080")
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
	err := mainWeb.Start("0.0.0.0:8080")
	if err != nil {
		fmt.Printf("错误: 启动HTTP服务失败: %s\n", err.Error())
		return
	}
	fmt.Println("成功: HTTP服务已启动")
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
