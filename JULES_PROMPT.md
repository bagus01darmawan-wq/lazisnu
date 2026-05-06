<instruction>You are an expert software engineer. You are working on a WIP branch. Please run `git status` and `git diff` to understand the changes and the current state of the code. Analyze the workspace context and complete the mission brief.</instruction>
<workspace_context>
</workspace_context>
<mission_brief>[Tolong bertindak sebagai Senior Full-Stack Auditor. Saya sedang menghadapi bug/isu pada fitur yang sedang saya kerjakan saat ini. 

Tanpa perlu saya jelaskan secara spesifik, tolong baca file-file kode saya. Pahami konteks alur kerjanya antara Frontend (Next.js) dan Backend (Fastify/Drizzle), lalu berikan laporan audit mendalam dengan format berikut:

1. 🔍 IDENTIFIKASI & AKAR MASALAH: 
Apa isu sebenarnya yang sedang terjadi? Jelaskan letak patahan logikanya secara teknis (misal: state tidak sinkron, respons API tidak sesuai, race condition, dsb).

2. 💡 SOLUSI KOMPREHENSIF: 
Langkah-langkah perbaikan apa yang harus dilakukan di sisi Frontend maupun Backend agar fitur ini berjalan sesuai ekspektasi dan kaidah arsitektur monorepo kita.

3. 🛡️ TINDAKAN PENCEGAHAN: 
Berikan saran best-practice agar bug serupa tidak menjalar ke modul lain.

4. 🚀 KODE OPTIMAL (Siap Deploy): 
Tuliskan perbaikan kodenya. Pastikan kode yang Anda tawarkan sudah bersih, efisien, dan mengikuti UI/UX serta konvensi kode di AGENTS.md.

Jangan lakukan perubahan file secara otomatis. Berikan laporannya terlebih dahulu, lalu tunggu instruksi saya selanjutnya!
