# 声明 TARGETARCH 变量（Docker BuildKit 自动提供）
ARG TARGETARCH

FROM alpine:latest

WORKDIR /app

# 接收构建参数
ARG TARGETARCH

# 根据目标架构自动拷贝对应的二进制文件
# TARGETARCH 值：amd64, arm64, arm
COPY GVia_${TARGETARCH} /app/gvia

# 添加执行权限
RUN chmod +x /app/gvia

# 创建 config 目录（程序会自动创建配置文件）
RUN mkdir -p /app/config

# 暴露端口
ARG PORT=8818
ENV PORT=8818
EXPOSE 8818
# 启动程序
CMD ["./gvia"]
