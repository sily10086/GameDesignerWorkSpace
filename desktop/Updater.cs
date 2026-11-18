using System;
using System.IO;
using System.Net;
using System.Text;
using System.Drawing;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Security.Cryptography;
using System.Collections.Generic;
using System.Web.Script.Serialization;

class UpdateEngine {
 public const string Repository="sily10086/GameDesignerWorkSpace";
 public static string Prefix="https://github.com/"+Repository+"/releases/";
 public static JavaScriptSerializer Json=new JavaScriptSerializer(){MaxJsonLength=2*1024*1024};
 public static Dictionary<string,object> Object(string text){var result=Json.DeserializeObject(text) as Dictionary<string,object>;if(result==null)throw new Exception("更新信息格式无效。");return result;}
 public static string Text(Dictionary<string,object> value,string key){return value.ContainsKey(key)?Convert.ToString(value[key]):"";}
 public static Version VersionOf(string value){if(!System.Text.RegularExpressions.Regex.IsMatch(value??"","^v?[0-9]+\\.[0-9]+\\.[0-9]+$"))throw new Exception("更新版本号无效。");return new Version(value.TrimStart('v'));}
 public static bool HasNewer(string current,string latest){return VersionOf(latest)>VersionOf(current);}
 public static WebClient Client(){var client=new LimitedClient();client.Headers["User-Agent"]="GameDesignerWorkerSpace-Updater";client.Headers["Accept"]="application/vnd.github+json";return client;}
 public static Dictionary<string,object> Installer(Dictionary<string,object> manifest,string version){
  if(Text(manifest,"application")!="GameDesignerWorkerSpace"||Text(manifest,"repository")!=Repository||Text(manifest,"platform")!="win32-x64"||Text(manifest,"version")!=version||Convert.ToInt32(manifest["schema"])!=1)throw new Exception("此更新包不适用于当前工作台。");
  foreach(string key in new[]{"managedRoots","protectedRoots"}){var values=manifest[key] as object[];var required=key=="managedRoots"?PayloadPolicy.Managed:PayloadPolicy.Protected;if(values==null||values.Length!=required.Length)throw new Exception("更新范围不符合项目保护规则。");foreach(string item in required)if(!Array.Exists(values,value=>Convert.ToString(value)==item))throw new Exception("更新范围不符合项目保护规则。");}
  var asset=manifest["installer"] as Dictionary<string,object>;if(asset==null)throw new Exception("缺少安装包信息。");string name="GameDesignerWorkerSpace-Setup-"+version+"-x64.exe";
  if(Text(asset,"name")!=name||Text(asset,"url")!=Prefix+"download/v"+version+"/"+name||!System.Text.RegularExpressions.Regex.IsMatch(Text(asset,"sha256"),"^[0-9a-fA-F]{64}$"))throw new Exception("安装包地址或校验信息无效。");
  long size=Convert.ToInt64(asset["size"]);if(size<1||size>1024L*1024*1024)throw new Exception("安装包大小无效。");return asset;
 }
 public static string Hash(string file){using(var input=File.OpenRead(file))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();}
 public static void Verify(string file,Dictionary<string,object> asset){if(new FileInfo(file).Length!=Convert.ToInt64(asset["size"])||!String.Equals(Hash(file),Text(asset,"sha256"),StringComparison.OrdinalIgnoreCase))throw new Exception("安装包校验失败，请重新下载；未执行安装。");}
 public static bool Running(string root){string key;using(var sha=SHA256.Create())key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(root.TrimEnd(Path.DirectorySeparatorChar).ToLowerInvariant()))).Replace("-","").Substring(0,24);try{using(var mutex=Mutex.OpenExisting("Local\\GDWS-"+key))return true;}catch(WaitHandleCannotBeOpenedException){return false;}}
 public static void SelfTest(string report){
  string folder=Path.Combine(Path.GetTempPath(),"gdws-updater-check-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
  try{if(!HasNewer("1.4.0","1.5.0")||HasNewer("1.5.0","1.5.0")||HasNewer("1.5.0","1.4.0"))throw new Exception("Version comparison failed");foreach(string path in new[]{"Project/a.json","App/../Project/a.json","App/Project/a.json","Data/settings.json","App/.git/config","App/project.json"})if(PayloadPolicy.Allowed(path))throw new Exception("Protected project path accepted");if(!PayloadPolicy.Allowed("App/dist/app.js"))throw new Exception("Application path rejected");
   string file=Path.Combine(folder,"package.exe");File.WriteAllText(file,"offline checksum fixture");var asset=new Dictionary<string,object>{{"name","GameDesignerWorkerSpace-Setup-1.5.0-x64.exe"},{"url",Prefix+"download/v1.5.0/GameDesignerWorkerSpace-Setup-1.5.0-x64.exe"},{"size",new FileInfo(file).Length},{"sha256",Hash(file)}};
   var manifest=new Dictionary<string,object>{{"schema",1},{"application","GameDesignerWorkerSpace"},{"repository",Repository},{"version","1.5.0"},{"platform","win32-x64"},{"managedRoots",PayloadPolicy.Managed},{"protectedRoots",PayloadPolicy.Protected},{"installer",asset}};Installer(Object(Json.Serialize(manifest)),"1.5.0");Verify(file,asset);File.AppendAllText(file,"changed");bool rejected=false;try{Verify(file,asset);}catch{rejected=true;}if(!rejected)throw new Exception("Modified package accepted");File.WriteAllText(report,Json.Serialize(new{ok=true,version=true,checksum=true,projectProtection=true}),new UTF8Encoding(false));
  }finally{Directory.Delete(folder,true);}
 }
}
class LimitedClient:WebClient{protected override WebRequest GetWebRequest(Uri address){var request=base.GetWebRequest(address);request.Timeout=20000;return request;}}
class UpdateForm:Form {
 string root,current,latest,downloaded;Dictionary<string,object> asset;Label status;TextBox notes;Button action;ProgressBar progress;bool busy=false;
 public UpdateForm(string directory){root=directory;current=UpdateEngine.Text(UpdateEngine.Object(File.ReadAllText(Path.Combine(root,"App","version.json"))),"version");Text="GameDesignerWorkerSpace · 工作台更新";ClientSize=new Size(610,435);MaximizeBox=false;FormBorderStyle=FormBorderStyle.FixedDialog;StartPosition=FormStartPosition.CenterScreen;Font=new Font("Microsoft YaHei UI",9F);BackColor=Color.FromArgb(246,249,242);string icon=Path.Combine(root,"App","Assets","app.ico");if(File.Exists(icon))Icon=new Icon(icon);
  Controls.Add(new Label(){Text="工作台更新",Left=27,Top=23,Width=540,Height=35,Font=new Font("Microsoft YaHei UI",17F,FontStyle.Bold),ForeColor=Color.FromArgb(42,91,65)});status=new Label(){Text="正在检查 GitHub 正式版本…",Left=30,Top=72,Width=550,Height=42};Controls.Add(status);notes=new TextBox(){Left=30,Top=120,Width=550,Height=175,Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,BackColor=Color.White,BorderStyle=BorderStyle.FixedSingle};Controls.Add(notes);Controls.Add(new Label(){Text="只更新程序、Runtime 和说明。保留 Project、Data、Logs 与独立项目。",Left=30,Top=309,Width=550,Height=25,ForeColor=Color.FromArgb(115,139,98)});progress=new ProgressBar(){Left=30,Top=344,Width=550,Height=10};Controls.Add(progress);action=new Button(){Text="检查更新",Left=415,Top=373,Width=165,Height=34,Enabled=false};action.Click+=Perform;Controls.Add(action);var releases=new LinkLabel(){Text="打开 GitHub 版本页面",Left=30,Top=383,Width=250,Height=25};releases.LinkClicked+=(s,e)=>Process.Start(new ProcessStartInfo(UpdateEngine.Prefix){UseShellExecute=true});Controls.Add(releases);Shown+=async(s,e)=>await Check();FormClosing+=(s,e)=>{if(busy){e.Cancel=true;status.Text="正在下载与校验，请稍候。";}};
 }
 async Task Check(){busy=true;action.Enabled=false;asset=null;downloaded=null;try{using(var client=UpdateEngine.Client()){
   var release=UpdateEngine.Object(await client.DownloadStringTaskAsync("https://api.github.com/repos/"+UpdateEngine.Repository+"/releases/latest"));if(Convert.ToBoolean(release["draft"])||Convert.ToBoolean(release["prerelease"]))throw new Exception("未找到正式版本。");latest=UpdateEngine.Text(release,"tag_name").TrimStart('v');UpdateEngine.VersionOf(latest);notes.Text=UpdateEngine.Text(release,"body").Replace("\n",Environment.NewLine);if(!UpdateEngine.HasNewer(current,latest)){status.Text="当前 v"+current+"，已是最新正式版本。";action.Text="重新检查";return;}
   string manifestURL=null;foreach(var item in (object[])release["assets"]){var value=item as Dictionary<string,object>;if(UpdateEngine.Text(value,"name")=="update-manifest.json")manifestURL=UpdateEngine.Text(value,"browser_download_url");}if(manifestURL!=UpdateEngine.Prefix+"download/v"+latest+"/update-manifest.json")throw new Exception("正式版本尚未提供完整的更新包。");asset=UpdateEngine.Installer(UpdateEngine.Object(await client.DownloadStringTaskAsync(manifestURL)),latest);status.Text="发现新版本 v"+latest+"（当前 v"+current+"）";action.Text="下载更新";
  }}catch(WebException error){status.Text=error.Response is HttpWebResponse&&((HttpWebResponse)error.Response).StatusCode==HttpStatusCode.NotFound?"尚未发布正式版本。":"无法检查更新，请检查网络后重试。";notes.Text=error.Message;action.Text="重新检查";}catch(Exception error){status.Text="更新检查未完成";notes.Text=error.Message;action.Text="重新检查";}finally{busy=false;action.Enabled=true;}}
 async void Perform(object sender,EventArgs args){
  if(asset==null){await Check();return;}
  if(downloaded!=null){if(UpdateEngine.Running(root)){MessageBox.Show("请先保存网页中的内容，并从系统托盘选择「退出工作台服务」，再点击安装。","安装更新",MessageBoxButtons.OK,MessageBoxIcon.Information);return;}try{UpdateEngine.Verify(downloaded,asset);Process.Start(new ProcessStartInfo(downloaded,"/dir=\""+root+"\""){UseShellExecute=true});Close();}catch(Exception error){MessageBox.Show(error.Message,"更新未完成");}return;}
  busy=true;action.Enabled=false;string partial=null;try{string folder=Path.Combine(Path.GetTempPath(),"GDWSUpdate-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);string file=Path.Combine(folder,UpdateEngine.Text(asset,"name"));partial=file+".partial";using(var client=UpdateEngine.Client()){client.DownloadProgressChanged+=(s,e)=>{progress.Value=Math.Min(100,e.ProgressPercentage);status.Text="正在下载 v"+latest+"… "+progress.Value+"%";};await client.DownloadFileTaskAsync(UpdateEngine.Text(asset,"url"),partial);}status.Text="正在校验 SHA-256…";await Task.Run(()=>UpdateEngine.Verify(partial,asset));File.Move(partial,file);downloaded=file;action.Text="安装更新";status.Text="校验通过。保存并退出托盘工作台后，点击安装。";}catch(Exception error){status.Text="下载未完成，可重试。";notes.Text=error.Message;if(partial!=null&&File.Exists(partial))File.Delete(partial);}finally{busy=false;action.Enabled=true;}
 }
}
class Updater {
 [STAThread] static int Main(string[] args){ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;try{
  if(args.Length>1&&args[0]=="--self-test"){UpdateEngine.SelfTest(args[1]);return 0;}
  string root=null;bool worker=false;for(int i=0;i<args.Length;i++){if(args[i]=="--root"&&i+1<args.Length)root=Path.GetFullPath(args[++i]).TrimEnd(Path.DirectorySeparatorChar);if(args[i]=="--worker")worker=true;}
  if(root==null||!File.Exists(Path.Combine(root,"GameDesignerWorkerSpace.exe"))||!File.Exists(Path.Combine(root,"App","version.json")))throw new Exception("请从安装版工作台的「检查更新」入口打开。");
  if(!worker){string folder=Path.Combine(Path.GetTempPath(),"GDWSUpdater-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);string copy=Path.Combine(folder,"Updater.exe");File.Copy(Application.ExecutablePath,copy);Process.Start(new ProcessStartInfo(copy,"--worker --root \""+root+"\""){UseShellExecute=true});return 0;}
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new UpdateForm(root));return 0;
 }catch(Exception error){if(args.Length>0&&args[0]=="--self-test")return 1;MessageBox.Show(error.Message,"工作台更新");return 1;}}
}
