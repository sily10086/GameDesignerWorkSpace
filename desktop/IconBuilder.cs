using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;
class IconBuilder {
 static GraphicsPath Round(float x,float y,float w,float h,float r){var p=new GraphicsPath();p.AddArc(x,y,r,r,180,90);p.AddArc(x+w-r,y,r,r,270,90);p.AddArc(x+w-r,y+h-r,r,r,0,90);p.AddArc(x,y+h-r,r,r,90,90);p.CloseFigure();return p;}
 static Bitmap Draw(int size){var b=new Bitmap(size,size,PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(b)){g.SmoothingMode=SmoothingMode.AntiAlias;g.ScaleTransform(size/256f,size/256f);g.Clear(Color.Transparent);using(var p=Round(8,8,240,240,64))using(var brush=new LinearGradientBrush(new Rectangle(8,8,240,240),Color.FromArgb(75,128,99),Color.FromArgb(30,77,58),45f))g.FillPath(brush,p);using(var pen=new Pen(Color.FromArgb(65,242,246,219),2))using(var p=Round(18,18,220,220,50))g.DrawPath(pen,p);
  using(var pen=new Pen(Color.FromArgb(238,243,222),12)){pen.LineJoin=LineJoin.Round;var pad=new GraphicsPath();pad.AddBezier(66,92,42,100,38,172,58,177);pad.AddBezier(58,177,70,181,87,158,98,155);pad.AddLine(98,155,158,155);pad.AddBezier(158,155,171,160,185,183,198,175);pad.AddBezier(198,175,218,164,208,102,188,94);pad.AddBezier(188,94,161,86,93,86,66,92);g.DrawPath(pen,pad);g.DrawLine(pen,81,111,81,141);g.DrawLine(pen,66,126,96,126);}
  using(var brush=new SolidBrush(Color.FromArgb(240,211,144))){g.FillEllipse(brush,163,109,12,12);g.FillEllipse(brush,184,131,12,12);}
  using(var pen=new Pen(Color.FromArgb(185,215,164),4)){g.DrawArc(pen,82,45,90,46,198,143);g.DrawLine(pen,132,60,144,48);}
 }return b;}
 static void Main(string[] args){var folder=args[0];Directory.CreateDirectory(folder);var images=new List<byte[]>();int[] sizes={16,24,32,48,64,128,256};foreach(int size in sizes)using(var b=Draw(size))using(var stream=new MemoryStream()){b.Save(stream,ImageFormat.Png);images.Add(stream.ToArray());if(size==256)b.Save(Path.Combine(folder,"app-icon.png"),ImageFormat.Png);}using(var file=File.Create(Path.Combine(folder,"app.ico")))using(var writer=new BinaryWriter(file)){writer.Write((ushort)0);writer.Write((ushort)1);writer.Write((ushort)sizes.Length);int offset=6+16*sizes.Length;for(int i=0;i<sizes.Length;i++){writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)0);writer.Write((byte)0);writer.Write((ushort)1);writer.Write((ushort)32);writer.Write(images[i].Length);writer.Write(offset);offset+=images[i].Length;}foreach(var data in images)writer.Write(data);}}
}
