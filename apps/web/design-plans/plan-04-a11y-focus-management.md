# Plan F3: A11y focus management di Modal, DropdownFilter, GlassSelect, PeriodPicker

**Finding ref:** F3 (audit 2026-09-05)
**Confidence:** High
**Scope:** 4 file komponen
**Risiko:** Sedang — keyboard handler logic; bug bisa block Tab/Escape

## Tujuan

Memenuhi prioritas-1 `fixing-accessibility` §3 (focus and dialogs):
- Modal: trap Tab cycle, set initial focus, restore focus on close
- DropdownFilter & GlassSelect: Escape restore focus ke trigger
- PeriodPicker: tambah keyboard handler dasar (Escape close + restore)
- Modal: tambah `aria-label="Tutup"` ke tombol close

## Sumber yang harus dibaca executor

1. `apps/web/src/components/ui/Modal.tsx` (120 baris)
2. `apps/web/src/components/ui/DropdownFilter.tsx` (194 baris)
3. `apps/web/src/components/ui/GlassSelect.tsx` (180 baris)
4. `apps/web/src/components/ui/PeriodPicker.tsx` (167 baris)
5. `.agents/rules/12-standar-ui-web.md` §9 — Modal patterns (template sudah dipakai di cans/users)

## Pattern universal: useRef trigger + restore focus

### Helper function (paste ke setiap file atau import dari utility baru)

```typescript
function useRestoreFocusOnClose(isOpen: boolean, triggerRef: React.RefObject<HTMLElement>) {
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement;
    } else if (previouslyFocused.current) {
      // restore only if focus is still inside our container (not already moved)
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [isOpen]);
}
```

## Spesifikasi perubahan

### File 1: `apps/web/src/components/ui/Modal.tsx`

**A. Tambah refs (baris 18, setelah state declarations):**
```typescript
const modalRef = useRef<HTMLDivElement>(null);
const closeButtonRef = useRef<HTMLButtonElement>(null);
const triggerRef = useRef<HTMLElement | null>(null);
const previouslyFocused = useRef<HTMLElement | null>(null);
```

**B. Update useEffect Esc handler (baris 27-39):**
Tambah logic:
- Saat `isOpen` true → simpan `document.activeElement` ke `previouslyFocused.current`, lalu auto-focus ke `closeButtonRef.current` (initial focus)
- Trap Tab: keydown handler untuk `Tab` — cycle focus dalam modal (`firstFocusable` ↔ `lastFocusable`)
- Saat close → restore `previouslyFocused.current.focus()` SEBELUM `setIsOpen(false)` panggil `onClose()`

```typescript
useEffect(() => {
  if (!isOpen) return;

  // Save trigger
  previouslyFocused.current = document.activeElement as HTMLElement;

  // Initial focus to close button (or title if exists)
  const focusTimer = window.setTimeout(() => {
    closeButtonRef.current?.focus();
  }, 50);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Tab' && modalRef.current) {
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.clearTimeout(focusTimer);
    document.body.style.overflow = 'unset';
    window.removeEventListener('keydown', handleKeyDown);
    // Restore focus
    previouslyFocused.current?.focus();
    previouslyFocused.current = null;
  };
}, [isOpen, onClose]);
```

**C. Attach refs (baris 57, modal content div):**
```tsx
<div ref={modalRef} className="...">
```

**D. Update close button (baris 83-93):**
```tsx
<button
  ref={closeButtonRef}
  onClick={onClose}
  aria-label="Tutup dialog"
  className="..."
>
  <X size={20} aria-hidden="true" />
</button>
```

### File 2: `apps/web/src/components/ui/DropdownFilter.tsx`

**A. Tambah ref & restore logic (baris 35, setelah refs):**
```typescript
const triggerRef = useRef<HTMLButtonElement>(null);
const previouslyFocused = useRef<HTMLElement | null>(null);
```

**B. Update handleKeyDown (baris 67-97):** tambah effect untuk `isOpen`:

```typescript
useEffect(() => {
  if (isOpen) {
    previouslyFocused.current = document.activeElement as HTMLElement;
  } else {
    previouslyFocused.current?.focus();
    previouslyFocused.current = null;
  }
}, [isOpen]);
```

**C. Attach ref ke trigger button (baris 107):**
```tsx
<button
  ref={triggerRef}
  ...
>
```

**Catatan:** input search internal sudah autoFocus (baris 140); restore focus saat close ke trigger button.

### File 3: `apps/web/src/components/ui/GlassSelect.tsx`

**Sama** dengan DropdownFilter pattern. Attach ref ke trigger button (baris 103), tambah useEffect untuk restore focus on close.

### File 4: `apps/web/src/components/ui/PeriodPicker.tsx`

**A. Tambah Escape handler (baris 28-36, di dalam useEffect click-outside):**

```typescript
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => { ... };
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleEsc);
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleEsc);
  };
}, []);
```

**B. Tambah ref ke trigger (baris 68):**
```tsx
<button ref={triggerRef} onClick={...} className="...">
```

### Yang TIDAK boleh dilakukan executor

- Jangan ubah styling/visual apapun
- Jangan ubah handler existing (klik outside, onChange, dll.) — hanya tambahkan
- Jangan hapus portal Modal
- Jangan ganti body overflow logic — masih perlu untuk prevent background scroll
- Jangan refactor GlassSelect atau DropdownFilter dengan library eksternal (Radix) — di luar scope; cukup manual focus mgmt

## Verifikasi

1. **Manual focus trap Modal:**
   - Buka modal di `cans/page.tsx` ("Tambah Kaleng")
   - Tekan Tab berulang → focus harus cycle dalam modal (tidak bocor ke elemen di belakang)
   - Tekan Shift+Tab → cycle mundur
   - Tekan Escape → modal close, focus kembali ke tombol "+ Tambah Kaleng"
2. **Manual a11y Modal:**
   - VoiceOver/NVDA: announce "Tutup dialog" button dengan benar
3. **Manual focus dropdown:**
   - Buka DropdownFilter, tekan Escape → close, focus kembali ke trigger
4. **Manual PeriodPicker:**
   - Buka picker, tekan Escape → close + restore focus
5. `pnpm typecheck` lulus
6. `pnpm build` lulus

## Rollback

Single `git revert`. Tidak ada data migration.

## Catatan untuk PR review

Modal adalah pusat banyak interaksi (8 halaman). Tambahkan screenshot/animasi GIF di deskripsi PR untuk klarifikasi fokus trap behavior.