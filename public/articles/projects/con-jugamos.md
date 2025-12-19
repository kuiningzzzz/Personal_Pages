# Con-jugamos - 西班牙语动词变位学习系统

[点击此处下载安卓APK安装包](http://quininezzzz.top/source/Con-jugamos.apk)

Con-jugamos是一款面向西班牙语学习者的动词变位学习软件，致力于通过科学的练习方法帮助学习者掌握西班牙语动词变位规则。本项目是北京大学《智能化软件系统与工程》课程的大作业项目，后续将与北京大学外国语学院合作进行持续维护和更新。

## 项目背景

西班牙语动词变位系统复杂，包含多种时态、语式和人称变化，是西班牙语学习的重点和难点。传统的学习方式往往效率较低，学习者难以系统掌握。Con-jugamos通过智能化的练习生成、个性化的学习路径和完善的数据统计，为西班牙语学习者提供了一个高效、便捷的动词变位学习平台。

该系统不仅适用于高校西班牙语专业学生的课程学习，也适合社会学习者进行自主练习。系统支持按教材课程进行系统学习，也支持自由练习模式，满足不同学习者的需求。

## 技术栈

### 前端技术
- **uni-app**: 跨平台应用开发框架，支持编译为微信小程序、H5、App等多端应用
- **Vue.js 2**: 前端MVVM框架
- **uni-ui**: uni-app官方UI组件库

### 后端技术
- **Node.js**: 服务端运行环境
- **Express**: Web应用框架
- **Better-SQLite3**: 轻量级嵌入式数据库
- **JWT**: 用户身份验证
- **bcryptjs**: 密码加密
- **nodemailer**: 邮件服务（用于验证码发送）
- **node-cron**: 定时任务调度

### AI集成
- **DeepSeek API**: AI智能题目生成服务

### 部署技术
- **Docker**: 容器化部署
- **Docker Compose**: 容器编排

## 功能特点

### 1. 多样化练习模式
- **例句填空**: 在句子语境中练习动词变位
- **快变快填**: 给定动词形式进行快速变位
- **组合练习**: 系统练习动词的一组变位形式

### 2. 课程学习系统
- 课程分级练习，按教材章节进行系统学习
- 课程进度追踪，记录每课的学习和练习完成情况
- 支持用户选择和管理自己的学习教材

### 3. 智能题库管理
- **公共题库**: 系统提供的高质量练习题，智能推荐机制
- **个人题库**: 用户可添加收藏题目，构建个人专属题库
- **AI生成题目&题目质量管控**: 集成DeepSeek API，智能生成高质量练习题
- **题目反馈系统**: 用户可对题目质量进行反馈，持续优化题库

### 4. 个性化学习功能
- **单词本管理**: 收藏重点动词，构建个人词汇表
- **错题本**: 自动记录错误题目，支持针对性复习
- **动词搜索**: 快速查询动词的完整变位表和释义
- **学习统计**: 详细的学习数据分析和可视化展示

### 5. 激励机制
- **每日打卡**: 记录学习连续天数，培养学习习惯
- **排行榜系统**: 周榜、月榜、总榜多维度排名
- **掌握度评级**: 根据练习次数和正确率评估动词掌握程度
- **学习成就**: 记录总练习次数、正确率、掌握动词数等数据

### 6. 用户体系
- 支持学生用户和社会用户两种类型
- 邮箱验证码登录注册
- 用户信息管理（学校、入学年份等）
- 用户反馈系统

### 7. 系统管理功能
- 版本更新机制，支持应用内更新提醒
- 完善的日志系统，记录API请求和系统运行状态
- 健康检查接口，便于监控服务状态
- 定时任务调度，自动清理过期数据

## 开发运行方式

### 环境要求
- Node.js >= 18.0.0（高于22.14.0版本的Node有可能会不兼容部分库）
- npm >= 8.0.0
- HBuilderX（用于uni-app开发）

### 后端服务启动

1. 克隆项目到本地：
```bash
git clone https://github.com/kuiningzzzz/Spanish-Verb-Conjugation-Practicer.git
cd Spanish-Verb-Conjugation-Practicer
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
```bash
cd server
cp .env.example .env
```

编辑`.env`文件，配置以下必要信息：
```env
PORT=3000
JWT_SECRET=your-secret-key-here
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=587
EMAIL_USER=your-email@qq.com
EMAIL_PASS=your-authorization-code
DEEPSEEK_API_KEY=your-api-key
```

4. 启动后端服务：
```bash
npm run dev
```

服务将在`http://localhost:3000`启动。访问`http://localhost:3000/api/health`检查服务状态。

### 前端应用开发

1. 配置API地址：
```bash
cd utils
cp base_url.js.example base_url.js
```

编辑`base_url.js`文件，设置后端API地址：
```javascript
export const BASE_URL = 'http://localhost:3000/api'
```

2. 使用HBuilderX打开项目根目录

3. 选择运行方式：
   - 运行到浏览器：运行 -> 运行到浏览器 -> Chrome
   - 运行到微信小程序：运行 -> 运行到小程序模拟器 -> 微信开发者工具
   - 运行到手机：运行 -> 运行到手机或模拟器

### 数据初始化

首次启动后端服务时，系统会自动执行以下初始化：
- 创建数据库表结构
- 导入动词基础数据
- 创建示例课程和教材数据

如需重新初始化数据，可删除db文件后重启服务。

## 服务器部署方式

### 使用Docker部署（推荐）

1. 确保服务器已安装Docker和Docker Compose

2. 进入server目录：
```bash
cd server
```

3. 配置环境变量：
```bash
cp .env.example .env
# 编辑.env文件，配置生产环境变量
```

4. 启动服务：
```bash
docker-compose up -d
```

5. 查看服务状态：
```bash
docker-compose ps
docker-compose logs -f
```

6. 停止服务：
```bash
docker-compose down
```

### 传统方式部署

如果不使用Docker，可以直接在服务器上运行：

1. 安装Node.js环境

2. 上传项目文件到服务器

3. 安装依赖并启动：
```bash
npm install --production
cd server
node index.js
```

4. 使用PM2进行进程管理（推荐）：
```bash
npm install -g pm2
pm2 start server/index.js --name "spanish-verb-api"
pm2 save
pm2 startup
```

## 项目结构设计

```
Spanish-Verb-Conjugation-Practicer/
├── pages/                          # 前端页面目录
│   ├── index/                      # 首页
│   ├── login/                      # 登录注册页
│   ├── practice/                   # 练习页面
│   ├── course/                     # 课程学习页
│   ├── vocabulary/                 # 单词本页面
│   ├── search/                     # 动词查询页
│   ├── question-bank/              # 题库管理页
│   ├── conjugation-detail/         # 动词变位详情页
│   ├── statistics/                 # 学习统计页
│   ├── leaderboard/                # 排行榜页
│   ├── profile/                    # 个人中心
│   │   └── settings/               # 设置页面
│   ├── feedback/                   # 用户反馈页
│   └── update/                     # 版本更新页
├── server/                         # 后端服务目录
│   ├── .env.example                # 环境变量示例
│   ├── .env                        # 本地环境文件（可选）
│   ├── Dockerfile                  # Docker构建文件
│   ├── docker-compose.yml          # Docker编排配置
│   ├── index.js                    # 服务入口文件
│   ├── data/                       # 运行时的 SQLite 数据文件
│   │   ├── feedback.db
│   │   ├── questions.db
│   │   ├── user_data.db
│   │   └── vocabulary.db
│   ├── database/                   # 数据库相关脚本与初始化
│   │   ├── db.js                   # 数据库连接和初始化
│   │   ├── initData.js             # 基础数据初始化
│   │   └── initCourseData.js       # 课程数据初始化
│   ├── models/                     # 数据模型层
│   │   ├── CheckIn.js
│   │   ├── Conjugation.js
│   │   ├── FavoriteVerb.js
│   │   ├── Feedback.js
│   │   ├── Lesson.js
│   │   ├── LessonVerb.js
│   │   ├── PracticeRecord.js
│   │   ├── Question.js
│   │   ├── QuestionFeedback.js
│   │   ├── Textbook.js
│   │   ├── User.js
│   │   ├── UserLessonProgress.js
│   │   ├── UserTextbook.js
│   │   ├── Verb.js
│   │   ├── VerificationCode.js
│   │   └── WrongVerb.js
│   ├── routes/                     # 路由层
│   │   ├── checkin.js
│   │   ├── course.js
│   │   ├── exercise.js
│   │   ├── feedback.js
│   │   ├── leaderboard.js
│   │   ├── question.js
│   │   ├── questionFeedback.js
│   │   ├── record.js
│   │   ├── user.js
│   │   ├── verb.js
│   │   ├── version.js
│   │   └── vocabulary.js
│   ├── services/                   # 业务逻辑层
│   │   ├── deepseek.js
│   │   ├── emailService.js
│   │   ├── exerciseGenerator.js
│   │   ├── imageCompression.js
│   │   ├── questionValidator.js
│   │   └── scheduler.js
│   ├── middleware/                 # 中间件
│   │   ├── auth.js
│   │   └── logger.js
│   ├── src/                        # 源数据与版本更新相关
│   │   ├── verbs.json
│   │   ├── version.json
│   │   ├── textbookWord/
│   │   │   └── textbook1.json
│   │   └── updates/                # 版本更新文件夹
│   └── logs/                       # 日志文件目录
├── utils/                          # 工具函数目录
│   ├── api.js                      # API接口封装
│   ├── base_url.js.example         # API地址配置示例
│   ├── common.js                   # 通用工具函数
│   └── settings.js                 # 应用设置
├── static/                         # 静态资源目录
│   └── css/                        # 样式文件
│       └── common.css              # 公共样式
├── App.vue                         # 应用主组件
├── main.js                         # 应用入口文件
├── pages.json                      # 页面配置文件
├── manifest.json                   # 应用配置文件
├── package.json                    # 项目依赖配置
├── API.md                          # API接口文档
└── README.md                       # 项目说明文档
```

### 架构设计说明

**前端架构**：采用uni-app框架，基于Vue.js开发。页面按功能模块划分，使用组件化开发模式，通过utils工具层统一管理API调用和通用逻辑。

**后端架构**：采用经典的MVC分层架构
- **Models层**：负责数据库操作，封装所有数据访问逻辑
- **Routes层**：定义API路由，处理HTTP请求和响应
- **Services层**：实现业务逻辑，处理复杂的业务场景
- **Middleware层**：提供横切关注点，如身份认证、日志记录等

**数据库设计**：使用SQLite关系型数据库，主要数据表包括：
- 用户相关：users（用户）、check_ins（打卡记录）
- 动词相关：verbs（动词）、conjugations（变位）
- 学习相关：practice_records（练习记录）、favorite_verbs（收藏）、wrong_verbs（错题）
- 题库相关：public_questions（公共题库）、private_questions（个人题库）、question_records（题目练习记录）
- 课程相关：textbooks（教材）、lessons（课程）、lesson_verbs（课程动词）、user_textbooks（用户教材）、user_lesson_progress（学习进度）
- 反馈相关：feedback（用户反馈）、question_feedback（题目反馈）

## API接口文档

详细的API接口文档请参见[API.md](./API.md)文件，包含所有接口的请求格式、参数说明和响应示例。

## 开发团队

本项目由北京大学《智能化软件系统与工程》课程世纪末彼岸花丛中的死之结界小组开发，后续将与北京大学外国语学院合作进行持续维护。

## 联系方式

如有问题或建议，欢迎通过应用内的用户反馈功能进行反馈，我们会及时处理并不断改进系统功能。
