#!/bin/bash

# Personal Pages 部署脚本
# 用于快速部署前后端服务

echo "======================================"
echo "  Personal Pages 部署脚本"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Docker 和 Docker Compose
echo "检查环境..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}错误: Docker Compose 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker 已安装${NC}"
echo -e "${GREEN}✓ Docker Compose 已安装${NC}"
echo ""

# 检查环境变量文件
echo "检查配置文件..."
if [ ! -f ".env.production" ]; then
    echo -e "${RED}错误: .env.production 文件不存在${NC}"
    exit 1
fi

if [ ! -f "server/.env" ]; then
    echo -e "${YELLOW}警告: server/.env 文件不存在，将使用默认配置${NC}"
fi

echo -e "${GREEN}✓ 配置文件检查完成${NC}"
echo ""

# 停止现有服务
echo "停止现有服务..."
docker-compose down
echo ""

# 构建并启动服务
echo "构建并启动服务..."
echo -e "${YELLOW}这可能需要几分钟时间，请耐心等待...${NC}"
echo ""

if docker-compose up -d --build; then
    echo ""
    echo -e "${GREEN}✓ 服务启动成功！${NC}"
    echo ""
    
    # 等待服务启动
    echo "等待服务完全启动..."
    sleep 5
    
    # 显示服务状态
    echo ""
    echo "======================================"
    echo "  服务状态"
    echo "======================================"
    docker-compose ps
    echo ""
    
    # 获取服务器 IP（尝试多种方法）
    SERVER_IP=$(hostname -I | awk '{print $1}')
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP=$(ip route get 1 | awk '{print $7;exit}')
    fi
    
    echo "======================================"
    echo "  访问地址"
    echo "======================================"
    echo -e "${GREEN}前端页面:${NC} http://${SERVER_IP}"
    echo -e "${GREEN}前端页面:${NC} http://quininezzzz.top"
    echo -e "${GREEN}API 接口:${NC} http://${SERVER_IP}/api/comments"
    echo ""
    
    echo "======================================"
    echo "  常用命令"
    echo "======================================"
    echo "查看日志: docker-compose logs -f"
    echo "查看状态: docker-compose ps"
    echo "停止服务: docker-compose down"
    echo "重启服务: docker-compose restart"
    echo ""
    
else
    echo ""
    echo -e "${RED}✗ 服务启动失败！${NC}"
    echo ""
    echo "请查看错误日志："
    echo "  docker-compose logs"
    echo ""
    exit 1
fi

echo -e "${GREEN}部署完成！${NC}"
