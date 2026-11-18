using System;
class PayloadPolicy {
 public static readonly string[] Managed={"GameDesignerWorkerSpace.exe","App","Runtime","Documents"};
 public static readonly string[] Protected={"Project","Projects","Data","Logs",".workbench",".git",".svn",".gdws"};
 public static bool Allowed(string value){
  if(String.IsNullOrEmpty(value)||value.StartsWith("/")||value.Contains(":"))return false;
  string[] parts=value.Replace('\\','/').Split('/');if(parts.Length==1)return String.Equals(parts[0],Managed[0],StringComparison.Ordinal);
  if(parts[0]!="App"&&parts[0]!="Runtime"&&parts[0]!="Documents")return false;
  foreach(string part in parts){if(part=="."||part==".."||part.Length==0)return false;foreach(string blocked in Protected)if(String.Equals(part,blocked,StringComparison.OrdinalIgnoreCase))return false;}
  return !String.Equals(parts[parts.Length-1],"project.json",StringComparison.OrdinalIgnoreCase)&&!String.Equals(parts[parts.Length-1],"project-format.json",StringComparison.OrdinalIgnoreCase);
 }
}
