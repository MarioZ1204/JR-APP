param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$File
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $File)) {
  Write-Error "Archivo no encontrado: $File"
  exit 2
}

$bytes = [IO.File]::ReadAllBytes($File)
if ($bytes.Length -eq 0) {
  Write-Error "Archivo vacio"
  exit 3
}

$code = @'
using System;
using System.Runtime.InteropServices;
public class JrRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, [In] DOCINFOA di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      return "OpenPrinter:" + Marshal.GetLastWin32Error();
    var di = new DOCINFOA { pDocName = "JR Ticket", pDataType = "RAW" };
    if (!StartDocPrinter(h, 1, di)) {
      int err = Marshal.GetLastWin32Error();
      ClosePrinter(h);
      return "StartDocPrinter:" + err;
    }
    if (!StartPagePrinter(h)) {
      int err = Marshal.GetLastWin32Error();
      EndDocPrinter(h);
      ClosePrinter(h);
      return "StartPagePrinter:" + err;
    }
    int offset = 0;
    while (offset < data.Length) {
      int chunk = Math.Min(4096, data.Length - offset);
      IntPtr p = Marshal.AllocCoTaskMem(chunk);
      Marshal.Copy(data, offset, p, chunk);
      int written;
      if (!WritePrinter(h, p, chunk, out written)) {
        int err = Marshal.GetLastWin32Error();
        Marshal.FreeCoTaskMem(p);
        EndPagePrinter(h);
        EndDocPrinter(h);
        ClosePrinter(h);
        return "WritePrinter:" + err;
      }
      Marshal.FreeCoTaskMem(p);
      offset += chunk;
    }
    EndPagePrinter(h);
    EndDocPrinter(h);
    ClosePrinter(h);
    return "OK";
  }
}
'@

if (-not ('JrRawPrinter' -as [type])) {
  Add-Type -TypeDefinition $code
}

$result = [JrRawPrinter]::Send($PrinterName, $bytes)
if ($result -ne 'OK') {
  Write-Error "No se pudo enviar a la impresora ${PrinterName}: $result"
  exit 1
}

exit 0
