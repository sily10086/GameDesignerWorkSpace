# 工作台更新

官方仓库：https://github.com/sily10086/GameDesignerWorkSpace

## 使用更新程序

安装 v1.5.0 或更新版本后，在项目库点击「工作台更新」，或在系统托盘菜单选择「检查工作台更新」。更新器位于 App/Tools/Updater.exe，可独立于网页运行。

v1.6.0 起，检查器同时读取 GitHub 和 Gitee 的正式版本。发现新版后自动下载安装包并校验大小及 SHA-256。下载成功后，先保存网页内容并从托盘退出工作台，再点击「安装更新」。安装器会预先填入当前工作台目录，安装结束后可重新打开工作台。

检查直接读取最新正式 Release 的 update-manifest.json，不要求登录 GitHub，也不占用匿名 REST API 配额。

更新程序会复制自身到临时目录运行，避免在更新时锁住 App 文件。下载或校验失败不会执行安装。断网、GitHub 限流或版本尚未发布时会明确提示，允许重试。

## 更新范围

仅更新 GameDesignerWorkerSpace.exe、App、Runtime 与 Documents。

Project、Projects、Data、Logs、.workbench、.git、.svn、.gdws 与独立项目内容不打入程序发行包。安装器拒绝携带这些受保护路径的更新包。项目的 Git/SVN 链接保留在项目里，工作台程序仓库与各项目仓库分开。

程序正式版本号与项目格式版本各自独立。此次工作台版本为 1.6.0，项目格式仍为 v1。源码提交需要先发布为正式 Release，才会成为用户可安装的新版本；检查器不会直接把 main 分支未发布的代码覆盖到用户机器。

## 双源更新（v1.6）

GitHub Release 与 Gitee 的 updates 分支清单会并行检查；先返回有效新版本的来源可立即进入下载。若首个来源没有新版本，会继续等待另一个来源，避免镜像同步延迟漏掉新版本。

真正下载安装包前，更新器会先测速：对 GitHub 和 Gitee 各取 256 KB 安装包（带 Range 请求，8 秒超时），按实测速度把更快的来源排到第一位，避免“清单读得快、但安装包下载慢”的源拖慢整次更新。两源并行探测；某源超时、报 404 或速度测不出时排到最后当备用，两个都测不出则维持原有顺序。窗口里会显示两源实测速度和已选用的来源。测速只读开头一小段，不会提前下载整包，也不影响大小与 SHA-256 校验。

安装包下载失败或校验不符会依次尝试同版本的其它来源；只有大小和 SHA-256 均符合清单的文件才能交给可见安装器。

Gitee 安装包先发布为发行版附件，确认下载地址可用后，再将 update-manifest.json 与 SHA256SUMS.txt 提交至 updates 分支。代码同步使用 main/master，项目目录和运行数据继续排除。

## 开发与发布

1. Windows x64：运行 npm ci、npm run prepare:runtime、npm test。
2. 修改功能后，统一提升 package.json、package-lock.json 根版本、dist/version.js、desktop/Launcher.cs 的 AssemblyVersion 与安装日志版本。
3. 运行 npm run build:release、npm run test:installer。
4. 构建生成安装包、便携 ZIP、update-manifest.json 和 SHA256SUMS.txt。发行文件位于仓库的上两级 releases 目录，项目内容不包含在内。
5. 提交、推送源码后创建 v版本号 标签并推送。GitHub Actions 会重新构建、验证并发布正式 Release；也可手动运行 Release workflow。
6. 本机可运行 node scripts/publish-release.mjs 发布已验证的发行文件。使用 GH_TOKEN / GITHUB_TOKEN 或本机 Git Credential Manager 的现有授权；凭据仅在进程内使用，不写入项目、配置或安装包。

已发布版本不可原地覆盖。如需修改内容，提升版本号发布下一版，避免同一版本出现不同校验值。

## v1.7.1 发布记录（2026-11-20）

- 正式版本 v1.7.1 已发布：GitHub Release 为权威正式版（`releases/latest`），Gitee 的 `updates` 分支清单与 GitHub 发行包校验值保持一致。
- 发布时本机 `github.com:443` 的 git 通道被网络代理拦截（CONNECT 502），SSH 公钥无权限。源码改用 GitHub Git Data API 逐提交重放到 `main`，并用 API 创建 `v1.7.1` 标签与上传发行文件；重放后 GitHub `main` 的文件树与本地 HEAD 完全一致（已校验）。Gitee 的 `main/master`、标签与 `updates` 分支走常规 git push 完成。
- GitHub Actions 在标签推送后自动构建并发布了正式 Release，其安装包为 Actions 重新编译产物，SHA-256 与本机构建不同。为避免校验失败，`updates` 分支的 `update-manifest.json` 与 `SHA256SUMS.txt` 采用 GitHub 正式 Release 附件的实际校验值，两源清单一致。
- Gitee 发行版的安装包附件需在 Gitee 网页手动上传，本机 Gitee 凭据不支持附件 API。当前 Gitee 安装包下载返回 404；更新器测速时会自动把该源排到最后，并从 GitHub 主源下载安装，不影响升级。若某用户的网络无法访问 GitHub，则需在 Gitee 补传安装包附件后才能从 Gitee 源更新。
- 端到端验证：从 1.7.0 能检测到 1.7.1；两源清单均可匿名读取且版本一致；GitHub 安装包支持 Range 探测（HTTP 206），可正常测速与下载。

## 源码运行

源码模式提供版本检查与 GitHub 下载入口。原地安装只面向发行版目录；源码目录、node_modules 和开发工具不交给用户更新器覆盖。

GitHub Releases API：https://docs.github.com/en/rest/releases/releases#get-the-latest-release
