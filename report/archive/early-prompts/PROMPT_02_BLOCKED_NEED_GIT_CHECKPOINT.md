# PROMPT 02 - BLOCKED: CAN GIT CHECKPOINT TRUOC KHI REFACTOR

Ngay tao: 2026-07-07  
Pham vi thuc hien: Phase 0 - Preflight Safety Gate  
Ket luan: **BLOCKED - khong duoc refactor source trong lan chay nay**

## 1. Ly do dung

Prompt 02 co quy tac an toan bat buoc:

- Truoc khi sua source, phai kiem tra git status.
- Neu khong co `.git` hoac khong co backup marker, phai tao report canh bao va dung truoc khi refactor source.

Ket qua kiem tra workspace hien tai:

- Thu muc hien tai khong phai git repository.
- Khong co `.git`.
- Khong tim thay backup/checkpoint marker ro rang o root.

Vi vay toi da dung dung theo safety gate. Khong tao folder Clean Architecture, khong sua backend, khong sua dashboard, khong chay npm ci, khong chay validation sau refactor.

## 2. File baseline da doc

Da doc cac file bat buoc trong Phase 0:

- `report/archive/early-prompts/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md`
- `backend/package.json`
- `dashboard/package.json`
- `backend/src/index.js`
- `dashboard/src/lib/api.ts`
- `dashboard/src/lib/auth.tsx`
- `docker-compose.yml`

Khong doc `.env` that va khong in secret.

## 3. Ket qua preflight

Lenh/kiem tra da chay:

- `git status --short --branch`
  - Ket qua: **FAIL**
  - Ly do: `fatal: not a git repository (or any of the parent directories): .git`

- `Test-Path .git`
  - Ket qua: **False**

- `Test-Path backend/node_modules`
  - Ket qua: **False**

- `Test-Path dashboard/node_modules`
  - Ket qua: **False**

- Tim marker backup/checkpoint/snapshot/restore o root
  - Ket qua: khong co marker ro rang.

## 4. Viec da khong thuc hien

Theo safety gate, toi da khong lam cac viec sau:

- Khong refactor source.
- Khong tao cau truc `backend/src/domain`, `application`, `infrastructure`, `presentation`.
- Khong tao cau truc `dashboard/src/features`, `components/ui`, `lib/api`, `lib/config`.
- Khong sua import/require.
- Khong sua `backend/package.json`.
- Khong sua `start-all.bat`.
- Khong sua dashboard hard-code localhost.
- Khong chay `npm ci`.
- Khong chay `prisma migrate`.
- Khong chay `prisma db push`.
- Khong chay `docker compose up`.
- Khong chay test script co the tao/doi du lieu.

## 5. Can lam truoc khi chay lai Prompt 02

Chon mot trong hai cach sau:

1. Tao git checkpoint tai root du an:

```powershell
git init
git add .
git commit -m "checkpoint before clean architecture refactor"
```

2. Neu du an da co git repository o thu muc cha hoac ban copy thieu `.git`, hay mo dung root repository co `.git` roi chay lai Prompt 02.

Sau khi co checkpoint:

- Chay lai Prompt 02.
- Khi do co the tiep tuc Phase 1 baseline validation.
- Neu `node_modules` van thieu, Prompt 02 cho phep chay `npm ci` trong `backend` va `dashboard` vi da co `package-lock.json`.

## 6. Final verdict

**BLOCKED - missing git checkpoint/dependencies**

Ly do chinh: thieu `.git`, nen khong co diem khoi phuc an toan neu refactor source lam hong behavior hien tai.

## 7. Prompt tiep theo nen lam gi

Sau khi tao git checkpoint, Prompt 02 co the duoc chay lai voi muc tieu:

- Tao docs `docs/architecture/ARCHITECTURE.md` va `docs/roadmap/REFACTOR_PLAN.md`.
- Tao cau truc folder Clean Architecture bang README compatibility.
- Refactor nho, co wrapper, khong doi public routes/webhook/Prisma schema.
- Chay validation tung vong.
