using System;
using System.IO;
using System.Text;
using System.Xml.Linq;
using System.Runtime.InteropServices;
using System.Collections.Generic;
// Preserve the upstream binaries. Create explicitly unsigned, app-local copies
// whose manifest selects UTF-8 without changing the machine's regional settings.
class Utf8Runtime {
 [UnmanagedFunctionPointer(CallingConvention.Winapi)]delegate bool LanguageCallback(IntPtr module,IntPtr type,IntPtr name,ushort language,IntPtr data);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool EnumResourceLanguages(IntPtr module,IntPtr type,IntPtr name,LanguageCallback callback,IntPtr data);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr LoadLibraryEx(string file,IntPtr reserved,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool FreeLibrary(IntPtr module);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr FindResource(IntPtr module,IntPtr name,IntPtr type);
 [DllImport("kernel32.dll")]static extern uint SizeofResource(IntPtr module,IntPtr resource);
 [DllImport("kernel32.dll")]static extern IntPtr LoadResource(IntPtr module,IntPtr resource);
 [DllImport("kernel32.dll")]static extern IntPtr LockResource(IntPtr resource);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr BeginUpdateResource(string file,bool deleteExisting);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool UpdateResource(IntPtr update,IntPtr type,IntPtr name,ushort language,byte[] data,uint length);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool EndUpdateResource(IntPtr update,bool discard);
 static void Require(bool condition){if(!condition)throw new Exception("Windows resource operation failed: "+Marshal.GetLastWin32Error());}
 static string ReadManifest(string file){IntPtr module=LoadLibraryEx(file,IntPtr.Zero,2);Require(module!=IntPtr.Zero);try{IntPtr resource=FindResource(module,new IntPtr(1),new IntPtr(24));if(resource==IntPtr.Zero)return "<assembly xmlns=\"urn:schemas-microsoft-com:asm.v1\" manifestVersion=\"1.0\"/>";byte[] data=new byte[SizeofResource(module,resource)];Marshal.Copy(LockResource(LoadResource(module,resource)),data,0,data.Length);return Encoding.UTF8.GetString(data).Trim('\0','\uFEFF');}finally{FreeLibrary(module);}}
 static ushort[] Languages(string file){var values=new List<ushort>();IntPtr module=LoadLibraryEx(file,IntPtr.Zero,2);Require(module!=IntPtr.Zero);try{EnumResourceLanguages(module,new IntPtr(24),new IntPtr(1),(m,t,n,language,data)=>{values.Add(language);return true;},IntPtr.Zero);}finally{FreeLibrary(module);}if(values.Count==0)values.Add(0);return values.ToArray();}
 static int Main(string[] args){try{if(args.Length!=1)throw new Exception("Expected the bundled SVN bin directory.");string folder=Path.GetFullPath(args[0]);foreach(string name in new[]{"svn","svnadmin"}){
  string original=Path.Combine(folder,name+".exe"),target=Path.Combine(folder,name+"-utf8.exe");var document=XDocument.Parse(ReadManifest(original));XNamespace settings="urn:schemas-microsoft-com:asm.v3",codepage="http://schemas.microsoft.com/SMI/2019/WindowsSettings";
  var application=document.Root.Element(settings+"application");if(application==null){application=new XElement(settings+"application");document.Root.Add(application);}var windows=application.Element(settings+"windowsSettings");if(windows==null){windows=new XElement(settings+"windowsSettings");application.Add(windows);}windows.SetElementValue(codepage+"activeCodePage","UTF-8");File.Copy(original,target,true);byte[] manifest=Encoding.UTF8.GetBytes(document.ToString(SaveOptions.DisableFormatting));IntPtr update=BeginUpdateResource(target,false);Require(update!=IntPtr.Zero);bool committed=false;try{foreach(ushort language in Languages(original))Require(UpdateResource(update,new IntPtr(24),new IntPtr(1),language,manifest,(uint)manifest.Length));Require(EndUpdateResource(update,false));committed=true;}finally{if(!committed)EndUpdateResource(update,true);}
  // A modified derivative must not retain the original publisher's signature.
  using(var stream=new FileStream(target,FileMode.Open,FileAccess.ReadWrite)){var reader=new BinaryReader(stream);stream.Position=0x3c;int pe=reader.ReadInt32();stream.Position=pe+24;ushort magic=reader.ReadUInt16();stream.Position=pe+24+(magic==0x20b?112:96)+4*8;stream.Write(new byte[8],0,8);}
 }File.WriteAllText(Path.Combine(Path.GetDirectoryName(folder),"GDWS_UTF8_NOTICE.txt"),"GameDesignerWorkerSpace supplies svn-utf8.exe and svnadmin-utf8.exe as unsigned derivatives of the accompanying upstream binaries. Only the Windows application manifest is changed to select the per-process UTF-8 code page (Windows 10 1903+). Original svn.exe and svnadmin.exe are preserved unchanged. No system locale or security setting is modified. Apache Subversion source: https://archive.apache.org/dist/subversion/ . Licenses remain in this distribution.\n",new UTF8Encoding(false));return 0;}catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}}
}
