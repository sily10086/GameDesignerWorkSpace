# 工作台更新

官方仓库：https://github.com/sily10086/GameDesignerWorkSpace

## 使用更新程序

安装 v1.5.0 或更新版本后，在项目库点击「工作台更新」，或在系统托盘菜单选择「检查工作台更新」。更新器位于 App/Tools/Updater.exe，可独立于网页运行。

检查器读取本仓库 GitHub Releases 的最新正式版本，显示当前版本、新版本与更新说明。找到更新后下载安装包并校验大小及 SHA-256。下载成功后，先保存网页内容并从托盘退出工作台，再点击「安装更新」。安装器会预先填入当前工作台目录；安装结束后重新打开工作台。

检查直接读取最新正式 Release 的 update-manifest.json，不要求登录 GitHub，也不占用匿名 REST API 配额。

更新程序会复制自身到临时目录运行，避免在更新时锁住 App 文件。下载或校验失败不会执行安装。断网、GitHub 限流或版本尚未发布时会明确提示，允许重试。

## 更新范围

仅更新 GameDesignerWorkerSpace.exe、App、Runtime 与 Documents。

Project、Projects、Data、Logs、.workbench、.git、.svn、.gdws 与独立项目内容不打入程序发行包。安装器拒绝携带这些受保护路径的更新包。项目的 Git/SVN 链接保留在项目里，工作台程序仓库与各项目仓库分开。

程序正式版本号与项目格式版本各自独立。此次工作台版本为 1.5.0，项目格式仍为 v1。源码提交需要先发布为正式 Release，才会成为用户可安装的新版本；检查器不会直接把 main 分支未发布的代码覆盖到用户机器。

## 开发与发布

1. Windows x64：运行 npm ci、npm run prepare:runtime、npm test。
2. 修改功能后，统一提升 package.json、package-lock.json 根版本、dist/version.js、desktop/Launcher.cs 的 AssemblyVersion 与安装日志版本。
3. 运行 npm run build:release、npm run test:installer。
4. 构建生成安装包、便携 ZIP、update-manifest.json 和 SHA256SUMS.txt。发行文件位于仓库的上两级 releases 目录，项目内容不包含在内。
5. 提交、推送源码后创建 v版本号 标签并推送。GitHub Actions 会重新构建、验证并发布正式 Release；也可手动运行 Release workflow。
6. 本机可运行 node scripts/publish-release.mjs 发布已验证的发行文件。使用 GH_TOKEN / GITHUB_TOKEN 或本机 Git Credential Manager 的现有授权；凭据仅在进程内使用，不写入项目、配置或安装包。

已发布版本不可原地覆盖。如需修改内容，提升版本号发布下一版，避免同一版本出现不同校验值。

## 源码运行

源码模式提供版本检查与 GitHub 下载入口。原地安装只面向发行版目录；源码目录、node_modules 和开发工具不交给用户更新器覆盖。

GitHub Releases API：https://docs.github.com/en/rest/releases/releases#get-the-latest-release
