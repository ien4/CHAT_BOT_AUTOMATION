# PROJECT PROGRESS - BBOTECH BOT AUTOMATION

## Prompt 03 Update - Architecture Shell Without Behavior Change

Ngày cập nhật: 2026-07-08

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Preflight Git | PASS | Baseline commit `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` tồn tại. Trước refactor chỉ có docs/report thay đổi từ Prompt 02B. |
| Backend architecture shell | PASS | Đã tạo `domain`, `application`, `infrastructure`, `presentation` cùng README cho các layer/folder chính. |
| Backend Prisma wrapper | PASS | Đã tạo `backend/src/infrastructure/persistence/prisma/client.js`, chỉ re-export singleton `backend/src/db.js`, không tạo PrismaClient thứ hai. |
| Backend config helper | PASS | Đã tạo `backend/src/infrastructure/services/config.js` với `getEnv`, `getRequiredEnv`, `isProduction`; chưa ép migrate code cũ. |
| Dashboard architecture shell | PASS | Đã tạo `components`, `features`, `lib/config`, `lib/api`, `lib/auth`, `lib/utils`, `styles` shell. |
| Dashboard config helper | PASS | Đã tạo `dashboard/src/lib/config/env.ts`; fallback local vẫn là `http://localhost:3001`. |
| Dashboard API client helper | PASS | Đã tạo `dashboard/src/lib/api/client.ts`; `dashboard/src/lib/api.ts` vẫn là compatibility facade và giữ interceptor cũ. |
| Hard-code localhost dashboard | PARTIAL | `http://localhost:3001` trong dashboard source đã gom về `dashboard/src/lib/config/env.ts`; chưa xử lý backend/scripts/root. |
| Source behavior | NO INTENTIONAL CHANGE | Không đổi Prisma schema, migrations, public API route, webhook URL, tenant handoff, RAG pipeline hoặc bot engine. |
| Backend validation sau thay đổi | STATIC PASS | `node --check` pass cho file cũ trọng yếu và wrapper mới; Prisma validate pass với `DATABASE_URL` dummy. |
| Dashboard validation sau thay đổi | STATIC PASS | `npx --no-install tsc --noEmit` pass; `npm run --if-present build` pass. |
| Runtime verification | NOT RUN | Không chạy app server, không gọi webhook/API thật, không dùng DB thật. |
| Final verdict | PASS WITH WARNINGS | Có thể sang Prompt 04, nhưng các warning baseline vẫn còn. |

Rủi ro còn lại sau Prompt 03:

- Backend chưa có lint/typecheck script thật.
- Dashboard `next lint` vẫn chưa có config không tương tác.
- `$queryRawUnsafe` vẫn còn trong backend.
- Hard-code localhost vẫn còn ở backend/scripts/root docs và cần Prompt 04 xử lý có kiểm soát.
- Default credential/fallback vẫn còn.
- Tenant scope, handoff và RAG chưa runtime verified.
- `start-all.bat` vẫn có `prisma db push --accept-data-loss`.

Điều kiện sang Prompt 04: chỉ nên làm config hardening + hard-code localhost cleanup + env policy, không chạm tenant handoff/RAG/schema/migrations.

## Prompt 02B Update - Safety Foundation + Baseline Validation

Ngày cập nhật: 2026-07-07

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Git checkpoint | PASS | Đã `git init` và tạo checkpoint local. |
| Commit checkpoint | `57a6fe52a17bb5b56b569fa9e7254b70cc2e44ca` | Message: `checkpoint before safety validation and clean architecture refactor`. |
| `.gitignore` | PASS | Đã bổ sung rule bảo vệ `node_modules/`, `.next/`, `dist/`, `build/`, `coverage/`, `.env`, `.env.*`, `!.env.example`, `*.log`, `.vercel/`, `uploads/`, `backend/uploads/`. |
| Secret/build artifact staged | PASS | Không phát hiện `.env` thật, `node_modules`, `.next`, build output hoặc log trong staged checkpoint. |
| Backend `npm ci` | PASS WITH WARNINGS | Cài thành công từ `backend/package-lock.json`; npm audit báo 10 vulnerabilities và một số package deprecated. Không chạy `npm audit fix`. |
| Dashboard `npm ci` | PASS WITH WARNINGS | Cài thành công từ `dashboard/package-lock.json`; npm audit báo 3 vulnerabilities. Không chạy `npm audit fix`. |
| `node_modules` tracking | PASS | `backend/node_modules/` và `dashboard/node_modules/` đang ignored, không bị Git track. |
| Backend syntax check | PASS | `node --check` pass cho `src/index.js`, `src/db.js`, `src/api/dashboard.js`, webhook handlers, tenant webhook, bot agent/tools, RAG pipeline. |
| Backend lint/typecheck | WARNING | Không có script `lint` hoặc `typecheck`; `npm run --if-present` không validate thực tế. |
| Prisma validate | WARNING | `npx prisma validate` fail nếu không có `DATABASE_URL`; pass khi dùng `DATABASE_URL` dummy local chỉ cho validate schema. Không chạy migrate/db push. |
| Dashboard lint | WARNING | `npm run lint` mở prompt cấu hình ESLint tương tác vì chưa có ESLint config; không tự cấu hình trong Prompt 02B. |
| Dashboard typecheck | PASS | `npx --no-install tsc --noEmit` pass. |
| Dashboard build | PASS | `npm run build` pass với Next.js 14. |
| P0 risks confirmed | CONFIRMED | `$queryRawUnsafe`, hard-code localhost, default credential/fallback, `db push --accept-data-loss`, `prisma migrate deploy`, thiếu thư mục `chatwoot/`. |
| Source runtime changed | NO | Không sửa `backend/src`, `dashboard/src`, Prisma schema, migrations, public routes hoặc webhook URL. |

Kết luận Prompt 02B: **PASS WITH WARNINGS**. Dự án có thể sang Prompt 03 nếu Prompt 03 chỉ tạo architecture shell/wrapper không đổi behavior, không đổi schema, không đổi route/webhook, và tiếp tục ghi validation sau từng nhóm nhỏ.

Điều kiện bắt buộc trước hoặc trong Prompt 03:

- Không bắt đầu refactor lớn khi chưa quyết định cách xử lý `next lint` đang thiếu ESLint config.
- Không coi backend là fully validated vì backend chưa có lint/typecheck script.
- Không chạy migration/db push.
- Không sửa `$queryRawUnsafe` hàng loạt trong cùng một bước; cần audit từng query có input người dùng.
- Không xóa default credential/fallback nếu chưa có test login/startup và kế hoạch env production.
- Không đụng flow tenant/handoff/RAG nếu chưa có checklist regression cụ thể.

Ngày cập nhật: 2026-07-07  
Phạm vi file này: theo dõi tiến độ, rủi ro, checklist tính năng và roadmap refactor an toàn cho dự án BBOTECH Bot Automation.

## 1. Tổng quan hiện tại

Dự án là hệ thống chatbot automation gồm backend Express/CommonJS, Prisma/PostgreSQL/pgvector, tích hợp Facebook webhook, Chatwoot, Telegram handoff, RAG knowledge base, dashboard Next.js 14 và một số script vận hành local.

Trạng thái sau Prompt 01, Prompt 02 và Prompt 02A:

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Audit kiến trúc Prompt 01 | Hoàn thành | Báo cáo tại `report/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md`. |
| Refactor Prompt 02 | Bị chặn | Không có `.git`, không có checkpoint an toàn, thiếu `node_modules`. Báo cáo tại `report/PROMPT_02_BLOCKED_NEED_GIT_CHECKPOINT.md`. |
| Prompt 02A | Hoàn thành tài liệu | Chỉ tạo tài liệu tiến độ/checklist/report, không sửa source runtime. |
| Git checkpoint | Chưa có | `git status --short --branch` báo không phải git repository; `Test-Path .git` là `False`. |
| Dependency local | Chưa cài | `backend/node_modules` và `dashboard/node_modules` đều chưa tồn tại. |
| Source refactor | Chưa thực hiện | Cần dừng refactor source cho đến khi có checkpoint và baseline validation. |

Kết luận vận hành: dự án có nhiều module đã tồn tại nhưng đang ở trạng thái rủi ro cao nếu refactor trực tiếp. Việc tiếp theo phải là dựng nền an toàn trước khi đụng vào `backend/src`, `dashboard/src`, Prisma schema hoặc migration.

## 2. Mục tiêu kỹ thuật cuối cùng

Mục tiêu cuối của giai đoạn clean architecture/refactor là đưa dự án về trạng thái có thể phát triển dài hạn mà không làm hỏng tính năng đang có.

Các mục tiêu chính:

| Mục tiêu | Kết quả mong muốn |
|---|---|
| Bảo toàn hành vi hiện tại | Facebook webhook, Chatwoot, Telegram handoff, dashboard, RAG, multi-tenant vẫn hoạt động sau từng bước. |
| Tách module rõ ràng | Backend tách routes, services, repositories, adapters và domain logic thay vì dồn vào file lớn. |
| Giảm hard-code môi trường | Dashboard/backend dùng cấu hình tập trung, không còn URL localhost cố định trong flow deploy. |
| Kiểm soát Prisma/database | Không dùng `db push --accept-data-loss` cho dữ liệu thật; migration phải có backup/checkpoint. |
| Giảm rủi ro raw SQL | Kiểm tra và thay thế/bao bọc các điểm `$queryRawUnsafe` nhạy cảm. |
| Chuẩn hóa multi-tenant | Mọi query dữ liệu khách hàng, hội thoại, nhân viên, knowledge phải có tenant scope rõ ràng. |
| Có baseline validation | Có lệnh validate/build/lint/test tối thiểu trước và sau refactor. |

## 3. Checklist nguyên tắc bảo vệ

Các nguyên tắc này bắt buộc áp dụng cho mọi prompt tiếp theo:

- [ ] Không sửa source runtime nếu chưa có git checkpoint hoặc bản sao lưu rõ ràng.
- [ ] Không chạy `prisma db push --accept-data-loss` trên dữ liệu thật.
- [ ] Không chạy migration nếu chưa có backup và baseline validation.
- [ ] Không đọc hoặc ghi file `.env` thật; chỉ được đọc `.env.example`.
- [ ] Không in token, secret, webhook secret hoặc URL có chứa credential vào tài liệu.
- [ ] Không xóa/move file hàng loạt khi chưa có danh sách thay đổi cụ thể.
- [ ] Không refactor nhiều module cùng lúc khi chưa có smoke test.
- [ ] Không đổi schema Prisma trong cùng bước với đổi logic nghiệp vụ lớn.
- [ ] Không sửa `backend/src` hoặc `dashboard/src` trong prompt chỉ yêu cầu audit/tài liệu.
- [ ] Mỗi bước refactor phải ghi lại file đã đổi, lý do đổi và cách kiểm tra.

## 4. Checklist trước refactor

Trước khi bắt đầu Prompt refactor source, cần hoàn thành tối thiểu các mục sau:

| Việc cần làm | Trạng thái | Ghi chú |
|---|---|---|
| Khởi tạo hoặc phục hồi git repository | Chưa xong | Cần có `.git` và checkpoint trước refactor. |
| Tạo commit/checkpoint baseline | Chưa xong | Nếu không dùng Git, cần backup toàn bộ thư mục dự án. |
| Cài dependency backend | Chưa xong | `backend/node_modules` chưa tồn tại. |
| Cài dependency dashboard | Chưa xong | `dashboard/node_modules` chưa tồn tại. |
| Chạy `npm run prisma:generate` hoặc lệnh tương đương an toàn | Chưa xong | Chỉ chạy sau khi dependency có sẵn; không chạy migration/db push. |
| Chạy `npx prisma validate` | Chưa xong | Validation schema không đụng dữ liệu. |
| Chạy backend lint/test/build nếu có | Chưa xong | `backend/package.json` cần được dùng làm nguồn lệnh. |
| Chạy dashboard lint/build nếu có | Chưa xong | Next.js build giúp phát hiện lỗi TypeScript/runtime import. |
| Ghi baseline lỗi hiện tại | Chưa xong | Không sửa trước khi ghi nhận lỗi gốc. |
| Cập nhật lại file tiến độ sau baseline | Chưa xong | Ghi kết quả vào file này hoặc report tiếp theo. |

## 5. Bản đồ tính năng hiện tại

Bảng kiểm chi tiết nằm tại [FEATURE_AUDIT_CHECKLIST.md](./FEATURE_AUDIT_CHECKLIST.md).

Tóm tắt theo nhóm:

| Nhóm | Phạm vi | Trạng thái tổng quan | Ưu tiên |
|---|---|---|---|
| A. Backend core | Express, auth, Prisma, dashboard API, seed | Đã có nhưng rủi ro file lớn và default credential | P0 |
| B. Messaging/webhook | Facebook, Chatwoot, Telegram, handoff | Đã có nhiều luồng; cần kiểm tra tenant scope và webhook signature | P0 |
| C. Bot/AI | Bot engine, LLM providers, tools, intents, appointments | Đã có; cần test hành vi và tách service sau checkpoint | P0 |
| D. RAG/knowledge | Upload, parser, embeddings, pgvector, search | Đã có; rủi ro `$queryRawUnsafe` và vector unsupported | P0 |
| E. Multi-tenant | Tenant registry, channel configs, scoped resources | Đã có; rủi ro trộn dữ liệu tenant cần ưu tiên audit | P0 |
| F. Dashboard | Trang quản trị, CRUD, analytics, handoff, settings | Đã có; hard-code localhost và vài flow bypass API client | P0 |
| G. DevOps/deploy | Docker, batch scripts, env example, webhook URLs | Đã có; rủi ro `db push --accept-data-loss`, thiếu thư mục Chatwoot | P0 |

## 6. Hidden bugs ưu tiên

P0 cần xử lý trước hoặc trong các bước đầu sau checkpoint:

| Rủi ro | Dấu hiệu hiện tại | Hướng kiểm tra an toàn |
|---|---|---|
| Không có git checkpoint | `.git` không tồn tại | Prompt 02B phải tạo checkpoint trước refactor. |
| Thiếu dependency | `backend/node_modules` và `dashboard/node_modules` không tồn tại | Chạy cài dependency có kiểm soát và ghi lại lỗi. |
| Raw SQL unsafe | `$queryRawUnsafe` trong dashboard, RAG, tenant handoff, seed | Audit từng query, ưu tiên query có input người dùng. |
| Hard-code localhost | Dashboard settings/campaigns/tenants, scripts, webhook URL | Gom cấu hình API base URL sau khi có baseline. |
| Tenant data mixing | Nhiều API cũ có thể chưa scope tenant đầy đủ | Kiểm tra query theo tenant/page/channel trước refactor. |
| Start script có thể phá dữ liệu | `start-all.bat` chạy `prisma db push --accept-data-loss` | Không dùng script này cho production/dữ liệu thật. |
| Default admin credential | Backend seed có fallback `admin/admin123` | Chỉ dùng local; production phải yêu cầu env mạnh. |
| Chatwoot local folder chưa xác nhận | Prompt 01 ghi nhận `chatwoot/` có thể thiếu | Không chạy batch script trước khi kiểm tra cấu trúc thực tế. |

P1 nên xử lý sau khi P0 ổn định:

| Rủi ro | Hướng xử lý |
|---|---|
| `backend/src/api/dashboard.js` quá lớn | Tách routes theo domain sau khi có regression check. |
| Dynamic `require` trong backend | Giữ CommonJS trước, nhưng giảm require trong handler khi tách service. |
| Dashboard fetch trực tiếp ngoài `lib/api.ts` | Chuẩn hóa về API client, interceptor auth và base URL. |
| Webhook URL stale | Cập nhật sau khi có deploy/ngrok/cloudflared flow rõ ràng. |
| Appointment docs có thể lệch code | So sánh `docs/appointment-modify-spec.md` với bot tools/API thực tế. |

P2 cải thiện dài hạn:

| Rủi ro/cải thiện | Hướng xử lý |
|---|---|
| Chuẩn hóa naming và module boundaries | Làm sau khi behavior đã được khóa bằng test/checklist. |
| Tăng test tự động | Thêm unit/integration tests theo module đã tách. |
| CI/CD | Sau khi repo có git và build baseline pass. |
| Deploy hardening | Tách local scripts khỏi production deploy. |

## 7. Roadmap refactor tổng thể

Roadmap đề xuất theo pha, chỉ bắt đầu từ Phase A sau khi Prompt 02B hoàn tất nền an toàn.

| Phase | Mục tiêu | Điều kiện vào | Kết quả mong muốn |
|---|---|---|---|
| A. Safety foundation | Git checkpoint, dependency, baseline validation | Có quyền tạo checkpoint | Biết lỗi gốc trước khi refactor. |
| B. Config hardening | Gom env/config, bỏ hard-code localhost | Baseline đã ghi nhận | API URL và webhook URL nhất quán. |
| C. Backend route split | Tách `dashboard.js` theo domain | Có smoke test dashboard API | File nhỏ hơn, behavior không đổi. |
| D. Service/repository layer | Tách logic nghiệp vụ khỏi route handler | Routes đã tách | Dễ test, ít duplicate Prisma query. |
| E. Tenant safety audit | Bảo đảm tenant scope toàn bộ data flow | Query map đầy đủ | Giảm rủi ro trộn dữ liệu. |
| F. RAG/database hardening | Kiểm soát vector/raw SQL | Có test hoặc sample data | Giảm `$queryRawUnsafe`, ổn định search. |
| G. Dashboard API cleanup | Chuẩn hóa axios client và auth flow | Backend API ổn định | Giảm fetch hard-code, giảm lỗi deploy. |
| H. DevOps cleanup | Tách local script khỏi production | App chạy ổn local | Script an toàn, không tự phá dữ liệu. |
| I. CI/test expansion | Thêm validation tự động | Build local ổn | Có guardrail cho thay đổi sau này. |

## 8. Lịch sử prompt

| Prompt | Kết quả | File liên quan |
|---|---|---|
| Prompt 01 - Read-only project audit + clean architecture mapping | Hoàn thành audit kiến trúc, không sửa source | `report/PROMPT_01_PROJECT_AUDIT_CLEAN_ARCHITECTURE_REPORT.md` |
| Prompt 02 - Controlled clean architecture reorganization | Bị chặn vì thiếu git checkpoint và dependency | `report/PROMPT_02_BLOCKED_NEED_GIT_CHECKPOINT.md` |
| Prompt 02A - Project progress file + feature audit checklist + next roadmap | Hoàn thành tài liệu tiến độ/checklist/report, không sửa source runtime | `docs/PROJECT_PROGRESS.md`, `docs/FEATURE_AUDIT_CHECKLIST.md`, `report/PROMPT_02A_PROJECT_PROGRESS_AND_AUDIT_PLAN_REPORT.md` |

## 9. Quy tắc cho prompt tiếp theo

Prompt tiếp theo phải tuân thủ các điều kiện sau:

- Chỉ làm đúng phạm vi đã ghi trong prompt, không tự ý refactor rộng.
- Nếu prompt đụng source runtime, việc đầu tiên phải kiểm tra `.git` và checkpoint.
- Nếu vẫn không có `.git`, chỉ được tạo tài liệu/report hoặc hướng dẫn checkpoint, không sửa `backend/src` và `dashboard/src`.
- Không chạy `docker compose up`, `start-all.bat`, `prisma db push`, `prisma migrate`, hoặc script có thể ghi database nếu chưa được yêu cầu rõ và chưa có backup.
- Không đọc `.env` thật; chỉ dùng `.env.example` để mapping biến môi trường.
- Mọi thay đổi phải cập nhật lại `docs/PROJECT_PROGRESS.md` hoặc tạo report mới trong `report/`.
- Khi có lỗi validation, ghi nguyên nhân và file liên quan, không che lỗi bằng refactor.

## 10. Bước rõ ràng tiếp theo - Prompt 02B

Tên đề xuất: `PROMPT 02B - SAFETY FOUNDATION + BASELINE VALIDATION BEFORE REFACTOR`.

Mục tiêu Prompt 02B:

1. Xác nhận lại workspace có `.git` hay chưa.
2. Nếu chưa có `.git`, tạo git repository local hoặc yêu cầu người vận hành xác nhận phương án checkpoint.
3. Tạo checkpoint baseline trước khi sửa source.
4. Cài dependency cho `backend` và `dashboard` nếu được phép.
5. Chạy các validation an toàn: package scripts, `prisma validate`, backend smoke check nếu khả thi, dashboard lint/build nếu khả thi.
6. Ghi lại toàn bộ lỗi baseline vào report mới.
7. Cập nhật trạng thái trong `docs/PROJECT_PROGRESS.md`.

Điều không làm trong Prompt 02B:

- Không refactor source.
- Không đổi Prisma schema.
- Không chạy migration hoặc `db push`.
- Không deploy.
- Không sửa logic chatbot/dashboard trước khi baseline được ghi nhận.

Khi Prompt 02B hoàn thành, dự án mới đủ điều kiện để bắt đầu Prompt 03 hoặc một prompt refactor nhỏ có kiểm soát.
