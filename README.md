# GameDesignerWorkerSpace 1.7

Windows x64 EXE 网页工作台，安装包自带 Node / Git / SVN。程序与每个游戏项目完全分离。

## 安装与启动

从 [GitHub Releases](https://github.com/sily10086/GameDesignerWorkSpace/releases/latest) 下载最新安装包，选择安装位置。完成后双击 GameDesignerWorkerSpace.exe 或桌面快捷方式；打开浏览器项目库，后台服务不显示 CMD。托盘提供重新打开项目库、检查更新和退出服务。

安装目录顶层只有 EXE 和 App、Runtime、Data、Documents、Logs。每个游戏项目默认在用户文档/GameDesignerWorkerSpace/Project 下独立保存；可通过 Data/settings.json 的 projectsDirectory 更换默认位置。

## 工作台更新

项目库「工作台更新」、工作台设置或系统托盘「检查工作台更新」同时尝试 GitHub 和 Gitee。任一来源返回有效新版本即可自动下载，失败时切换备用来源。更新程序只更新 EXE、App、Runtime 与 Documents，保留 Project、独立项目、Data 和 Logs；下载包先校验大小和 SHA-256。安装前请保存网页并退出托盘服务，再使用可见安装器完成安装。

首次获得双源更新、图片插入和可视化图表功能，请下载安装 v1.6.0；之后使用内置更新器。源码提交需发布为正式 Release 才成为可安装更新。详见 [更新与发布说明](UPDATING.md)。

## 从源码构建

Windows x64，Node 24.15.0：运行 `npm ci`、`npm run prepare:runtime`、`npm test`、`npm run build:release`、`npm run test:installer`。发行包带完整运行依赖，使用者不需要单独安装 Node/Git/SVN。

仓库只收录应用源码、预构建网页组件和许可，不包含真实 Project、独立项目内容、Data、本机凭据、日志或运行时二进制。GitHub Actions 可验证 main 分支并在推送版本标签后构建发布。

## 文档编辑

点击文档在右侧半屏直接编辑，左侧页面可继续操作。拖动中线调整宽度，双击或点击「恢复半屏」复位；中线支持方向键，右上角支持全屏。提供展开与收起动效，小屏使用整屏编辑。

输入 `/` 快速插入标题、列表、待办、表格、引用、代码块、分割线、图片链接、思维导图或流程图。选中文字设置格式，标题生成大纲；支持表格增删行列、查找、阅读模式、撤销/重做与 Markdown 源码。正文自动写入项目中的 Markdown，图表保存为 Mermaid，继续通过 Git/SVN 协作。

图片支持工具栏选择、Ctrl+V 粘贴截图和拖入。每篇文档独立保存在 `docs/<文档ID>/`，图片只放该文档的 `Image/`，正文使用 `![说明](Image/文件名.png)` 相对路径。支持 PNG/JPEG/WebP/GIF/AVIF，单张不超过 20 MB。复制或同步文档文件夹时一并包含 Image。

思维导图与流程图可作为正文中的内容块就地编辑或展开。导图默认向右树状，支持双击改文字、Tab 子节点、Enter 同级节点、折叠、缩放、撤销和重做；流程图支持添加步骤/判断/起止节点、拖动布局、锚点连线和文字编辑。图表仍保存为可读的 Mermaid 文本，布局和折叠信息保存在注释中；特殊语法可使用高级源码入口继续编辑。编辑器、画布及许可均随安装包离线提供。

源码同时发布到 [GitHub](https://github.com/sily10086/GameDesignerWorkSpace) 和 [Gitee](https://gitee.com/YuAStudio/game-designer-work-space)。Gitee 的 `updates` 分支只放更新清单与校验文件，安装包放发行版附件；项目资料不进入这两个公开仓库。

## 项目库与仓库

- 链接导入：选择 Git/SVN，填写链接；只检出和关联一个项目。支持空仓库创建项目和旧仓库的项目相对路径。
- 关联文件夹：读取独立项目目录，不移动原目录。同一个项目 ID 可显式更换本机目录关联。
- 仓库设置：本地项目绑定空仓库；非空仓库必须通过链接导入，避免覆盖既有历史。
- 上传：仅提交该项目。Git 生成提交并推送绑定分支，SVN 提交新增/修改/删除。Git 作者姓名邮箱仅作用于此提交。
- 更新：工作副本有本地变更时拒绝覆盖；Git 只允许快进更新，不强制推送，不自动解决团队冲突。
- 项目回收站：软删除和恢复写入该项目的 project.json，不删除整个工作副本。
- 清空回收站：只清理已移入回收站（deletedAt）的项目，需要二次确认且不可恢复。内部项目（`Project/<项目ID>/`）删除整个文件夹，包括 attachments、文档 Image 等所有目录；通过「关联文件夹 / 链接导入」挂载的外部项目同样删除它关联的那个文件夹，确认弹窗会列出每个项目将被删掉的路径。服务端会重新校验磁盘上的 project.json，失败时保留页面状态以便重试。
- 外部文件夹的删除红线：磁盘根目录、用户主目录、工作台自身及其上级目录一律拒绝删除；目录已不存在时只清索引，不算失败。
- 单项目彻底删除：回收站卡片上的「彻底删除」只清掉这一个项目，复用上面同一套校验与不可恢复口径；确认弹窗会写明将被删除的文件夹路径。

仓库链接保存在项目目录的 .gdws/repository.json。Data/library.json 只记录本机目录位置，不承载整个工作台的远程仓库配置。账号/Token 只保留在服务内存，不写入项目或安装包；SSH 使用用户自己的密钥。

## 格式与升级

project-format.json 标记独立项目格式版本 1。文档正文是 Markdown，图表是 Mermaid，任务/角色/设定按记录保存为 JSON。工作台版本与项目格式版本分开，不支持的新格式会提示升级，停止写入，不用示例数据覆盖。

旧版 Project/<项目ID> 仍可读取。迁移时复制到独立目录，保留旧副本。项目文件夹可被其他工作台单独关联使用，无需复制应用程序。工作台升级只更新 EXE、App、Runtime、Documents，保留 Data、Logs 和外部项目。升级前请先从托盘退出服务。

## 开发验证

源代码位于开发目录；最终用户发布物由 scripts/build-release.mjs 生成分层目录、图标、便携包及安装器。npm test 覆盖存储、项目库、Windows 启动和 Git/SVN 本地仓库；node scripts/verify-installer.mjs 验证实际安装器、内置运行时及升级保留。

图表引擎已随 App/dist/vendor 分发，不要求最终用户执行 npm install。Runtime 保留各组件许可，来源和源码地址见安装目录 Documents/THIRD_PARTY_NOTICES.md。
