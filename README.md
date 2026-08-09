# 마음이 생겼을 때 누르는 버튼

비밀 URL 하나짜리 웹 페이지. 버튼을 누르면 **내 카카오톡("나와의 채팅")으로 알림**이 오고,
동시에 **이메일로도** 같은 내용이 온다.

성공 기준은 하나다: 버튼이 눌린 그 순간 알림이 반드시 도착할 것. 언제 눌릴지 모르기 때문에
(내일일 수도, 반년 뒤일 수도) 설계가 전부 거기에 맞춰져 있다.

```
그 애 → /w/<SECRET_SLUG> → 버튼 → 한 줄 메시지 → 전송
                                     ├─ 카카오톡 나에게 보내기
                                     ├─ 이메일 (백업, 항상 같이 발송)
                                     └─ Redis 로그 (둘 다 실패해도 기록은 남음)

Vercel Cron (매일) → 카카오 토큰 갱신 → 만료 없이 유지
```

## 왜 크론이 필요한가

카카오 리프레시 토큰은 **60일 미사용 시 만료**되고, 새 토큰은 잔여 유효기간이 1개월 미만일
때만 재발급된다. 매일 갱신을 돌리면 30일마다 자동으로 새 토큰을 받게 되어 사실상 무기한
유지된다. 이게 없으면 두 달 뒤에 눌린 버튼은 카카오 알림을 못 보낸다.

## 설정

### 1. 카카오 (developers.kakao.com)

1. **내 애플리케이션 → 애플리케이션 추가하기**
2. **앱 키** 탭 → `REST API 키` 복사 → `KAKAO_REST_API_KEY`
3. **카카오 로그인** → 활성화 **ON**
4. **카카오 로그인 → Redirect URI** 등록 (문자 단위로 정확히 일치해야 함)
   - 로컬: `http://localhost:3000/api/auth/kakao/callback`
   - 배포: `https://<도메인>/api/auth/kakao/callback`
5. **카카오 로그인 → 보안** → `Client Secret` 생성, 상태 **사용함** → `KAKAO_CLIENT_SECRET`
6. **카카오 로그인 → 동의항목** → `카카오톡 메시지 전송 (talk_message)` 설정

> 나에게 보내기는 사업자 등록도, 앱 심사도 필요 없다. (친구에게 보내기는 필요하지만 쓰지 않는다.)

### 2. Upstash Redis

[console.upstash.com](https://console.upstash.com) 에서 무료 Redis 생성 →
REST URL / REST TOKEN 을 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 에.

### 3. Resend (이메일 백업)

[resend.com](https://resend.com) 가입 → API Key 생성 → `RESEND_API_KEY`.
`NOTIFY_EMAIL_TO` 는 **Resend 가입에 쓴 이메일과 같아야 한다** (도메인 인증 전에는 본인
주소로만 발송 가능). `RESEND_FROM` 은 `onboarding@resend.dev` 그대로 둔다.

### 4. 비밀값 생성

```bash
node -e "console.log('SECRET_SLUG =', require('crypto').randomBytes(9).toString('base64url'))"
node -e "console.log('ADMIN_SECRET =', require('crypto').randomBytes(24).toString('base64url'))"
```

### 5. 로컬 실행

```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev
```

브라우저에서 `http://localhost:3000/api/auth/kakao/start?key=<ADMIN_SECRET>` 접속 →
**내 카카오 계정으로 로그인·동의** → "연동 완료" 화면이 뜨면 준비 끝.

`http://localhost:3000/w/<SECRET_SLUG>` 에서 실제로 눌러보고 카카오톡과 메일이 오는지 확인.

### 6. 배포 (Vercel)

```bash
npx vercel            # 프로젝트 연결
npx vercel --prod
```

- Vercel 프로젝트 **Settings → Environment Variables** 에 `.env.local` 값 전부 등록
- `KAKAO_REDIRECT_URI` 와 `NEXT_PUBLIC_SITE_URL` 은 **실제 배포 도메인**으로 바꿀 것
- 바꾼 Redirect URI 를 카카오 콘솔에도 추가 등록
- `CRON_SECRET` 은 Vercel이 자동 주입한다 (직접 넣어도 됨)
- 배포 후 `https://<도메인>/api/auth/kakao/start?key=<ADMIN_SECRET>` 로 **프로덕션에서 한 번 더 연동**
  (토큰은 Redis에 저장되므로 로컬/프로덕션이 같은 Redis를 쓰면 한 번으로 충분)

크론(`vercel.json`)은 매일 04:00 UTC(= KST 13시경)에 `/api/cron/refresh` 를 호출한다.
Vercel Hobby 플랜의 크론은 하루 1회까지이며 실행 시각에 ±59분 오차가 있다 — 이 용도에는 충분하다.

## 운영

| 무엇 | 어떻게 |
|---|---|
| 상태 확인 | `GET /api/admin/status?key=<ADMIN_SECRET>` — 토큰 잔여일, 마지막 갱신, 누른 기록 |
| 크론 수동 실행 | `GET /api/cron/refresh?key=<ADMIN_SECRET>` |
| 테스트 기록 삭제 | `DELETE /api/admin/status?key=<ADMIN_SECRET>` |
| 재연동 | `GET /api/auth/kakao/start?key=<ADMIN_SECRET>` |

토큰 갱신이 실패하거나 만료가 임박하면 `NOTIFY_EMAIL_TO` 로 경고 메일이 온다.

## 동작 원칙

- **누른 사람에게는 항상 성공 화면을 보여준다.** 카카오가 죽었든 토큰이 만료됐든, 그건 내 문제지
  그 애가 볼 일이 아니다. 실패는 로그와 경고 메일로 나에게만 온다.
- **틀린 slug 는 404.** "비밀번호가 틀렸다"가 아니라 아무것도 없는 것처럼 보인다.
- 60초 내 중복 전송 차단, IP당 시간당 5회 제한, 전송 후 `localStorage` 로 완료 상태 유지.

## 개발

```bash
npm test        # vitest
npm run typecheck
npm run build
```

핵심 테스트 두 가지:
- 카카오 전송이 실패해도 이메일은 나가고 로그는 남는가 (`src/lib/notify.test.ts`)
- 갱신 응답에 `refresh_token` 이 없을 때 기존 토큰을 지우지 않는가 (`src/lib/kakao.test.ts`)
