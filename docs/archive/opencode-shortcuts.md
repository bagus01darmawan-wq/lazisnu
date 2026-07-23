# OpenCode CLI — Referensi Lengkap Shortcut & Perintah

> **Leader key default:** `Ctrl+X`
> Semua `<leader>` di bawah = `Ctrl+X`

---

## 1. NAVIGASI PERCAKAPAN (Scrolling)

| Aksi | Shortcut |
|------|----------|
| Scroll satu halaman ke atas | `PageUp` / `Ctrl+Alt+B` |
| Scroll satu halaman ke bawah | `PageDown` / `Ctrl+Alt+F` |
| Scroll setengah halaman ke atas | `Ctrl+Alt+U` |
| Scroll setengah halaman ke bawah | `Ctrl+Alt+D` |
| Scroll satu baris ke atas | `Ctrl+Alt+Y` |
| Scroll satu baris ke bawah | `Ctrl+Alt+E` |
| Lompat ke pesan paling awal | `Home` / `Ctrl+G` |
| Lompat ke pesan paling akhir | `End` / `Ctrl+Alt+G` |

---

## 2. SLASH COMMANDS

| Perintah | Fungsi | Shortcut |
|----------|--------|----------|
| `/connect` | Tambah provider / API key | — |
| `/compact` atau `/summarize` | Ringkas sesi | `<leader>C` |
| `/details` | Tampilkan/sembunyikan detail tool | — |
| `/editor` | Buka external editor | `<leader>E` |
| `/exit` `/quit` `/q` | Keluar dari opencode | `<leader>Q` |
| `/export` | Export sesi ke markdown | `<leader>X` |
| `/help` | Bantuan | — |
| `/init` | Setup AGENTS.md | — |
| `/models` | Lihat daftar model | `<leader>M` |
| `/new` `/clear` | Sesi baru | `<leader>N` |
| `/redo` | Redo perubahan | `<leader>R` |
| `/sessions` `/resume` `/continue` | Ganti sesi | `<leader>L` |
| `/share` | Bagikan sesi | — |
| `/themes` | Pilih tema | `<leader>T` |

---

## 3. INPUT & EDITING PESAN

| Aksi | Shortcut |
|------|----------|
| Kirim pesan | `Enter` |
| Baris baru (newline) | `Shift+Enter` / `Ctrl+Enter` / `Alt+Enter` / `Ctrl+J` |
| Hapus semua input | `Ctrl+C` |
| Tempel | `Ctrl+V` |
| Panggil perintah shell | Awali pesan dengan `!` |
| Referensi file | Ketik `@` lalu cari file |
| Sisipkan gambar | Drag & drop ke terminal |

### Navigasi Kursor

| Aksi | Shortcut |
|------|----------|
| Pindah kursor ke kiri | `Left` / `Ctrl+B` |
| Pindah kursor ke kanan | `Right` / `Ctrl+F` |
| Pindah ke awal baris | `Ctrl+A` |
| Pindah ke akhir baris | `Ctrl+E` |
| Pindah ke awal visual line | `Alt+A` |
| Pindah ke akhir visual line | `Alt+E` |
| Pindah ke awal seluruh input | `Home` |
| Pindah ke akhir seluruh input | `End` |
| Satu kata ke kiri | `Alt+F` / `Alt+Right` / `Ctrl+Right` |
| Satu kata ke kanan | `Alt+B` / `Alt+Left` / `Ctrl+Left` |

### Seleksi

| Aksi | Shortcut |
|------|----------|
| Seleksi ke kiri | `Shift+Left` |
| Seleksi ke kanan | `Shift+Right` |
| Seleksi ke atas | `Shift+Up` |
| Seleksi ke bawah | `Shift+Down` |
| Seleksi ke awal baris | `Ctrl+Shift+A` |
| Seleksi ke akhir baris | `Ctrl+Shift+E` |
| Seleksi ke awal visual line | `Alt+Shift+A` |
| Seleksi ke akhir visual line | `Alt+Shift+E` |
| Seleksi ke awal input | `Shift+Home` |
| Seleksi ke akhir input | `Shift+End` |
| Seleksi satu kata ke kiri | `Alt+Shift+F` / `Alt+Shift+Right` |
| Seleksi satu kata ke kanan | `Alt+Shift+B` / `Alt+Shift+Left` |
| Seleksi semua | `Win+A` |

### Delete & Undo

| Aksi | Shortcut |
|------|----------|
| Hapus karakter sebelum kursor | `Backspace` / `Shift+Backspace` |
| Hapus karakter di kursor | `Ctrl+D` / `Delete` / `Shift+Delete` |
| Hapus satu baris penuh | `Ctrl+Shift+D` |
| Hapus sampai akhir baris | `Ctrl+K` |
| Hapus sampai awal baris | `Ctrl+U` |
| Hapus kata sebelumnya | `Ctrl+W` / `Ctrl+Backspace` / `Alt+Backspace` |
| Hapus kata berikutnya | `Alt+D` / `Alt+Delete` / `Ctrl+Delete` |
| Undo input | `Ctrl+Z` / `Ctrl+-` / `Win+Z` |
| Redo input | `Ctrl+.` / `Win+Shift+Z` |

---

## 4. MANAJEMEN SESI

| Aksi | Shortcut |
|------|----------|
| Sesi baru | `<leader>N` |
| Daftar sesi | `<leader>L` |
| Ganti nama sesi | `Ctrl+R` |
| Hapus sesi | `Ctrl+D` |
| Hentikan respons AI | `Escape` |
| Export sesi | `<leader>X` |
| Compact sesi | `<leader>C` |
| Undo perubahan | `<leader>U` |
| Redo perubahan | `<leader>R` |
| Copy pesan | `<leader>Y` |
| Toggle conceal (sembunyikan detail) | `<leader>H` |

---

## 5. NAVIGASI SUBAGENT

| Aksi | Shortcut |
|------|----------|
| Masuk ke subagent pertama | `<leader>Down` |
| Pindah ke subagent berikutnya | `Right` |
| Pindah ke subagent sebelumnya | `Left` |
| Kembali ke parent session | `Up` |

---

## 6. MODEL & PROVIDER

| Aksi | Shortcut |
|------|----------|
| Daftar model tersedia | `<leader>M` |
| Daftar provider | `Ctrl+A` |
| Ganti model (recent) | `F2` |
| Ganti model mundur | `Shift+F2` |
| Toggle favorite model | `Ctrl+F` |
| Cycle variant model | `Ctrl+T` |
| Tampilkan variant list | — (set `variant_list`) |
| Tambah provider | `/connect` |

---

## 7. AGENT & MODE

| Aksi | Shortcut |
|------|----------|
| Daftar agent | `<leader>A` |
| Ganti agent (Plan ↔ Build) | `Tab` |
| Ganti agent mundur | `Shift+Tab` |

---

## 8. TEMA & TAMPILAN

| Aksi | Shortcut |
|------|----------|
| Daftar tema | `<leader>T` |
| Toggle sidebar | `<leader>B` |
| Toggle scrollbar | — (set `scrollbar_toggle`) |
| Toggle status view | `<leader>S` |
| Toggle animasi | — (set `app_toggle_animations`) |
| Toggle diff wrap | — (set `app_toggle_diffwrap`) |
| Toggle file context | — (set `app_toggle_file_context`) |
| Toggle tool details | `/details` |
| Toggle thinking | `/thinking` |
| Tips (shortcut help) | `<leader>H` |

---

## 9. DIALOG & AUTOCOMPLETE

| Aksi | Shortcut |
|------|----------|
| Pilih item sebelumnya | `Up` / `Ctrl+P` |
| Pilih item berikutnya | `Down` / `Ctrl+N` |
| Page up di dialog | `PageUp` |
| Page down di dialog | `PageDown` |
| Ke awal daftar | `Home` |
| Ke akhir daftar | `End` |
| Konfirmasi pilihan | `Enter` |
| Toggle MCP | `Space` |
| Toggle plugin | `Space` |
| Sembunyikan autocomplete | `Escape` |
| Autocomplete select | `Enter` |
| Autocomplete complete | `Tab` |
| Install plugin | `Shift+I` |
| Permission fullscreen | `Ctrl+F` |

---

## 10. WHICH KEY (HELP OVERLAY)

| Aksi | Shortcut |
|------|----------|
| Tampilkan which-key | `Ctrl+Alt+K` |
| Toggle layout | `Ctrl+Alt+Shift+K` |
| Toggle pending | `Ctrl+Alt+Shift+P` |
| Grup sebelumnya | `Ctrl+Alt+Left` / `Ctrl+Alt+[` |
| Grup berikutnya | `Ctrl+Alt+Right` / `Ctrl+Alt+]` |
| Scroll up | `Ctrl+Alt+Up` / `Ctrl+Alt+P` |
| Scroll down | `Ctrl+Alt+Down` / `Ctrl+Alt+N` |
| Page up | `Ctrl+Alt+PageUp` |
| Page down | `Ctrl+Alt+PageDown` |

---

## 11. LAINNYA

| Aksi | Shortcut / Cara |
|------|-----------------|
| Buka command palette | `Ctrl+P` |
| Buka docs | — (set `docs_open`) |
| Buka editor | `<leader>E` |
| Set working directory | — (set `workspace_set`) |
| Prompt stash | — (set `prompt_stash`) |
| Stash list | — (set `prompt_stash_list`) |
| Stash pop | — (set `prompt_stash_pop`) |
| Hapus stash | `Ctrl+D` |
| Fork sesi | — (set `session_fork`) |
| Buka console | — (set `app_console`) |
| Buka debug | — (set `app_debug`) |
| Heap snapshot | — (set `app_heap_snapshot`) |
| Copy sesi | — (set `session_copy`) |
| Pindah sesi | — (set `session_move`) |
| Toggle username | — (set `username_toggle`) |
| Toggle display thinking | — (set `display_thinking`) |

---

## 12. KONFIRMASI PERMISSION

| Aksi | Shortcut |
|------|----------|
| Izinkan | `Y` |
| Tolak | `N` |
| Selalu izinkan (sesi ini) | `A` |

---

## 13. IDE EXTENSION (VS Code / Cursor)

| Aksi | macOS | Windows / Linux |
|------|-------|-----------------|
| Buka panel opencode | `Cmd+Esc` | `Ctrl+Esc` |
| Sesi baru | `Cmd+Shift+Esc` | `Ctrl+Shift+Esc` |
| Sisipkan referensi file (`@file`) | `Cmd+Option+K` | `Alt+Ctrl+K` |

---

## 14. CLI COMMANDS (Terminal)

Jalankan dari terminal (di luar TUI):

| Perintah | Fungsi |
|----------|--------|
| `opencode [project]` | Launch TUI di direktori tertentu |
| `opencode run "<pesan>"` | Eksekusi prompt satu kali (headless) |
| `opencode serve` | Start headless HTTP API server |
| `opencode web` | Start server + web UI |
| `opencode attach <url>` | Attach TUI ke server yang berjalan |
| `opencode acp` | Agent Client Protocol (jembatan IDE) |
| `opencode session` | Lihat / hapus sesi |
| `opencode export [sessionID]` | Export sesi ke JSON |
| `opencode import` | Import data |
| `opencode stats` | Statistik penggunaan |
| `opencode init` | Inisialisasi project (AGENTS.md) |
| `opencode github` | Kelola GitHub agent |
| `opencode pr` | Fetch & checkout GitHub PR |
| `opencode upgrade` | Upgrade opencode ke versi terbaru |
| `opencode uninstall` | Uninstall opencode |
| `opencode --version` | Cek versi |

---

## 15. BUILT-IN TOOLS (Yang bisa digunakan AI)

| Tool | Fungsi |
|------|--------|
| `read` | Baca file dengan line number |
| `write` | Buat / timpa file |
| `edit` | Edit spesifik (search & replace) |
| `bash` | Eksekusi shell command |
| `grep` | Cari konten file dengan regex |
| `glob` | Cari file berdasarkan pola nama |
| `webfetch` | Fetch & parse konten web |
| `diagnostics` | LSP diagnostics (error, warning) |
| `codesymbols` | Daftar simbol kode (fungsi, class) |
| `codedefinition` | Lompat ke definisi simbol |
| `codereferences` | Cari semua referensi simbol |
| `todo_read` | Baca task list |
| `todo_write` | Update task checklist |

---

## 16. TIPS KONFIGURASI

### Nonaktifkan mouse capture (agar scroll native terminal berfungsi)

Buat `tui.json` di folder project atau di `~/.config/opencode/tui.json`:
```jsonc
{
  "mouse": false
}
```

### Custom keybinds

```jsonc
{
  "keybinds": {
    "messages_copy": ["<leader>y", "ctrl+shift+c"],
    "input_paste": {
      "key": "ctrl+v",
      "preventDefault": false
    }
  }
}
```

### Nonaktifkan keybind

```jsonc
{
  "keybinds": {
    "session_compact": "none"
  }
}
```

---

> **Catatan:** `none` berarti shortcut tidak terikat secara default — bisa diatur manual di `tui.json`.
> Dibuat berdasarkan dokumentasi resmi opencode: https://opencode.ai/docs
