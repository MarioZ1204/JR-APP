using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace JRSistema
{
    public class Program
    {
        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    public class MainForm : Form
    {
        private Process _node;
        private readonly string _root;
        private readonly Label _status;
        private readonly Button _btnOpen;
        private readonly Button _btnStop;
        private readonly NotifyIcon _tray;
        private string _nodeExe;

        public MainForm()
        {
            _root = ResolveRoot();
            Text = "JR Sistema";
            Width = 460;
            Height = 240;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(250, 248, 244);
            Font = new Font("Segoe UI", 10f);

            Controls.Add(new Label
            {
                Text = "JR — Sistema de restaurante",
                AutoSize = false,
                Left = 20,
                Top = 18,
                Width = 400,
                Height = 28,
                Font = new Font("Segoe UI", 12f, FontStyle.Bold)
            });

            _status = new Label
            {
                Text = "Iniciando…",
                AutoSize = false,
                Left = 20,
                Top = 56,
                Width = 400,
                Height = 56
            };
            Controls.Add(_status);

            _btnOpen = new Button
            {
                Text = "Abrir en el navegador",
                Left = 20,
                Top = 130,
                Width = 190,
                Height = 36,
                Enabled = false
            };
            _btnOpen.Click += delegate { OpenBrowser(); };
            Controls.Add(_btnOpen);

            _btnStop = new Button
            {
                Text = "Cerrar sistema",
                Left = 220,
                Top = 130,
                Width = 180,
                Height = 36
            };
            _btnStop.Click += delegate { Close(); };
            Controls.Add(_btnStop);

            _tray = new NotifyIcon
            {
                Text = "JR Sistema",
                Visible = true,
                Icon = SystemIcons.Application
            };
            _tray.DoubleClick += delegate
            {
                Show();
                WindowState = FormWindowState.Normal;
                Activate();
            };

            FormClosing += OnClosing;
            Shown += delegate { BeginStart(); };
        }

        private static string ResolveRoot()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            if (File.Exists(Path.Combine(baseDir, "package.json"))) return baseDir;

            string homeFile = Path.Combine(baseDir, "jr-home.txt");
            if (File.Exists(homeFile))
            {
                try
                {
                    string p = File.ReadAllText(homeFile).Trim().Trim('"');
                    if (!string.IsNullOrEmpty(p) && File.Exists(Path.Combine(p, "package.json")))
                        return p.TrimEnd('\\', '/');
                }
                catch { }
            }

            return baseDir;
        }

        private void BeginStart()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try { StartServer(); }
                catch (Exception ex)
                {
                    SetStatus("Error: " + ex.Message);
                }
            });
        }

        private void SetStatus(string text)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                BeginInvoke(new Action(delegate { SetStatus(text); }));
                return;
            }
            _status.Text = text;
        }

        private void EnableOpen()
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                BeginInvoke(new Action(EnableOpen));
                return;
            }
            _btnOpen.Enabled = true;
        }

        private void StartServer()
        {
            if (!File.Exists(Path.Combine(_root, "package.json")))
            {
                SetStatus("No abra una copia del .exe en el escritorio.\nUse el acceso directo creado por instalar.bat\no abra JR Sistema.exe dentro de C:\\JR-Sistema");
                MessageBox.Show(
                    "No copie solo el archivo JR Sistema.exe al escritorio.\n\n" +
                    "1) Deje el programa en C:\\JR-Sistema (carpeta completa)\n" +
                    "2) Ejecute instalar.bat\n" +
                    "3) Use el acceso directo \"JR Sistema\" del escritorio\n\n" +
                    "(Ese acceso directo apunta a la carpeta correcta; no es una copia del .exe)",
                    "JR Sistema",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            _nodeExe = FindNodeExe();
            if (string.IsNullOrEmpty(_nodeExe))
            {
                SetStatus("No se encontró Node.js.\nInstálelo desde https://nodejs.org y reinicie el PC.");
                MessageBox.Show(
                    "No se encontró Node.js en este PC.\n\n" +
                    "1) Instale Node.js LTS 22 o superior:\n   https://nodejs.org\n" +
                    "2) Cierre sesión o reinicie el PC\n" +
                    "3) Vuelva a abrir JR Sistema\n\n" +
                    "Si ya lo instaló, reinicie Windows para que el acceso directo lo detecte.",
                    "JR Sistema",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            if (!Directory.Exists(Path.Combine(_root, "node_modules")))
            {
                string rootLower = _root == null ? "" : _root.ToLowerInvariant();
                bool protectedDir = rootLower.IndexOf("\\program files") >= 0;
                if (protectedDir)
                {
                    SetStatus("Esta carpeta está en Archivos de programa.\nMuévala a C:\\JR-Sistema");
                    MessageBox.Show(
                        "No se recomienda Archivos de programa.\n\nMueva la carpeta a C:\\JR-Sistema y ejecute instalar.bat",
                        "JR Sistema",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                    return;
                }
                SetStatus("Primera vez: instalando dependencias…\nPuede tardar unos minutos.");
                string npmJs = Path.Combine(Path.GetDirectoryName(_nodeExe), "npm.cmd");
                int npm;
                if (File.Exists(npmJs))
                    npm = RunHidden("cmd.exe", "/c \"\"" + npmJs + "\" install\"", _root);
                else
                    npm = RunHidden("cmd.exe", "/c npm install", _root);
                if (npm != 0)
                {
                    SetStatus("Falló npm install. Revise internet o ejecute instalar.bat");
                    return;
                }
            }

            SetStatus("Arrancando servidor…");
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = _nodeExe;
            psi.Arguments = "server/index.js";
            psi.WorkingDirectory = _root;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            try
            {
                string nodeDir = Path.GetDirectoryName(_nodeExe);
                string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
                if (!string.IsNullOrEmpty(nodeDir) && pathEnv.IndexOf(nodeDir, StringComparison.OrdinalIgnoreCase) < 0)
                    psi.EnvironmentVariables["PATH"] = nodeDir + ";" + pathEnv;
            }
            catch { }

            _node = Process.Start(psi);
            if (_node == null)
            {
                SetStatus("No se pudo iniciar el servidor.");
                return;
            }

            Thread.Sleep(1600);
            if (_node.HasExited)
            {
                SetStatus("El servidor se cerró al arrancar.\nEjecute instalar.bat e intente de nuevo.");
                return;
            }

            SetStatus("Sistema en marcha.\nDeje esta ventana abierta durante el servicio.");
            EnableOpen();
            OpenBrowser();
        }

        private static string FindNodeExe()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "", "Programs", "node", "node.exe"),
                Path.Combine(Environment.GetEnvironmentVariable("APPDATA") ?? "", "nvm", "nodejs", "node.exe"),
                @"C:\nodejs\node.exe",
                @"C:\Program Files\nodejs\node.exe"
            };
            foreach (string c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
            }

            try
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Node.js"))
                {
                    if (k != null)
                    {
                        object v = k.GetValue("InstallPath");
                        if (v != null)
                        {
                            string p = Path.Combine(v.ToString(), "node.exe");
                            if (File.Exists(p)) return p;
                        }
                    }
                }
            }
            catch { }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = "/c where node";
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                Process p = Process.Start(psi);
                if (p != null)
                {
                    string output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(5000);
                    if (p.ExitCode == 0)
                    {
                        string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (string line in lines)
                        {
                            string t = line.Trim();
                            if (t.EndsWith("node.exe", StringComparison.OrdinalIgnoreCase) && File.Exists(t))
                                return t;
                        }
                    }
                }
            }
            catch { }

            return null;
        }

        private static int RunHidden(string file, string args, string cwd)
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = file;
            psi.Arguments = args;
            psi.WorkingDirectory = cwd;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process p = Process.Start(psi);
            if (p == null) return 1;
            p.WaitForExit();
            return p.ExitCode;
        }

        private static void OpenBrowser()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "http://localhost:3000";
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch { }
        }

        private void OnClosing(object sender, FormClosingEventArgs e)
        {
            if (_node != null && !_node.HasExited)
            {
                DialogResult r = MessageBox.Show(
                    "¿Cerrar el sistema?\nSe detendrá el servidor hasta que lo abra otra vez.",
                    "JR Sistema",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                if (r != DialogResult.Yes)
                {
                    e.Cancel = true;
                    return;
                }
                try
                {
                    _node.Kill();
                    _node.WaitForExit(3000);
                }
                catch { }
            }
            if (_tray != null) _tray.Visible = false;
        }
    }
}
