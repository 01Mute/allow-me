# 마음이 생겼을 때 누르는 버튼

비밀 URL 하나짜리 웹 페이지. 버튼을 누르면 **텔레그램 봇이 나에게 메시지**를 보내고,
동시에 **이메일로도** 같은 내용이 온다.

성공 기준은 하나다: 버튼이 눌린 그 순간 알림이 반드시 도착할 것. 언제 눌릴지 모르기 때문에
(내일일 수도, 반년 뒤일 수도) 설계가 전부 거기에 맞춰져 있다.

```
그 애 → /w/<SECRET_SLUG> ─┬─ 페이지 열림 → 텔레그램 (방문 알림, IP·위치 포함)
                          │
                          └─ 버튼 → 한 줄 메시지 → 전송
                                     ├─ 텔레그램 봇 → 나
                                     ├─ 이메일 (백업, 항상 같이 발송)
                                     └─ Redis 로그 (둘 다 실패해도 기록은 남음)
```

## 방문 알림

페이지가 열릴 때마다 텔레그램으로 시각·IP·대략적 위치·기기가 온다. **매번 온다** — 같은
기기가 곧바로 다시 들어와도 온다. 조용한 경우는 둘뿐이다:

- **크롤러 제외** — 링크를 카카오톡에 보내면 카카오가 미리보기 카드를 만들려고 페이지를
  가져간다. 거르지 않으면 링크를 보내는 순간 "열어봤어요" 알림이 온다. 반대로 카카오톡
  **인앱 브라우저**(그 애가 실제로 링크를 탭했을 때)는 통과시켜야 한다 — 둘 다 UA에 Kakao가
  들어 있어서 이 구분이 `src/lib/visit.test.ts`에 고정되어 있다.
- **`VISIT_IGNORE_IPS`** — 내 IP를 넣어두면 내가 열어볼 때는 조용하다.

새로고침도 한 번의 방문으로 세고 알림도 한 번 더 온다. 그게 이 기능의 요구사항이다.

알림은 텔레그램만 간다. 방문은 버튼과 달리 놓쳐도 되는 정보라 이메일 백업을 붙이지 않았다.

### 같은 기기인지 어떻게 아는가

`src/proxy.ts`가 첫 방문에 무작위 id를 쿠키로 심고, 이후 방문에서 그걸 읽는다. 그래서
"처음 보는 기기" / "전에 왔던 그 기기 (3번째)"를 구분할 수 있다.

쿠키를 심는 곳이 proxy인 이유는 **Server Component가 쿠키를 설정할 수 없기 때문**이다. 읽기는
되지만 쓰기는 안 되고, id는 읽을 것이 아직 없는 첫 요청부터 필요하다.

이건 **브라우저**를 식별하는 것이지 하드웨어가 아니다. 사이트 데이터 삭제, 시크릿 모드,
같은 폰의 다른 앱에서 열기는 모두 새 id가 된다. 기기의 MAC 주소는 웹서버가 얻을 수 없다 —
MAC은 링크 계층 주소라 라우터를 넘지 못하고, 브라우저에도 그걸 읽는 API가 없다.

## 왜 텔레그램인가

처음엔 카카오톡으로 만들었다가 갈아엎었다. 카카오톡에서 봇이 나에게 **먼저** 말을 걸려면
알림톡/친구톡이 필요하고 그건 비즈니스 채널 전환(사업자등록증)이 전제다. 우회로였던
"나에게 보내기" API는 동작은 하지만 OAuth 연동이 필요하고, **리프레시 토큰이 60일 미사용 시
만료**돼서 토큰을 살려두는 일일 크론과 토큰 저장소가 따라붙었다.

텔레그램 봇 토큰은 폐기하기 전까지 만료되지 않는다. 그래서 크론도, 토큰 회전 로직도,
"반년 뒤에 눌리면 알림이 안 갈 수도 있다"는 위험도 전부 없어졌다.

## 설정

### 1. 텔레그램 봇

1. 텔레그램에서 [@BotFather](https://t.me/BotFather) 에게 `/newbot` → 이름 정하기 →
   토큰 발급 → `TELEGRAM_BOT_TOKEN`
2. 방금 만든 **내 봇과의 채팅방에 들어가서 아무 메시지나 하나 보낸다**
   (봇은 먼저 말 건 적 없는 상대에게 메시지를 보낼 수 없다)
3. chat id 확인:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```
   응답의 `result[0].message.chat.id` → `TELEGRAM_CHAT_ID`

> 알림을 확실히 받으려면 그 채팅방의 알림이 음소거되어 있지 않은지 확인할 것.

### 2. Upstash Redis

[console.upstash.com](https://console.upstash.com) 에서 무료 Redis 생성 →
REST URL / REST TOKEN 을 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 에.
누른 기록과 레이트리밋에만 쓴다.

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

`http://localhost:3000/w/<SECRET_SLUG>` 에서 실제로 눌러보고 텔레그램과 메일이 오는지 확인.

### 6. 배포 (Vercel)

```bash
npx vercel            # 프로젝트 연결
npx vercel --prod
```

- Vercel 프로젝트 **Settings → Environment Variables** 에 `.env.local` 값 전부 등록
- `NEXT_PUBLIC_SITE_URL` 은 실제 배포 도메인으로
- 배포 후 폰에서 실제 URL 을 열어 한 번 눌러보고, 아래로 테스트 기록을 지운다

## 운영

| 무엇 | 어떻게 |
|---|---|
| 상태 확인 | `GET /api/admin/status?key=<ADMIN_SECRET>` — 누락된 환경변수, 누른 기록, 방문 기록 |
| 기록 삭제 | `DELETE /api/admin/status?key=<ADMIN_SECRET>` — 누른 기록 + 방문 기록 |

## 동작 원칙

- **누른 사람에게는 항상 성공 화면을 보여준다.** 텔레그램이 죽었든 뭐든, 그건 내 문제지
  그 애가 볼 일이 아니다. 실패는 로그와 이메일로 나에게만 온다.
- **틀린 slug 는 404.** "비밀번호가 틀렸다"가 아니라 아무것도 없는 것처럼 보인다.
- 60초 내 중복 전송 차단, IP당 시간당 5회 제한, 전송 후 `localStorage` 로 완료 상태 유지.

## 개발

```bash
npm test        # vitest
npm run typecheck
npm run build
```

핵심 테스트:
- 텔레그램 전송이 실패해도 이메일은 나가고 로그는 남는가 (`src/lib/notify.test.ts`)
- 텔레그램이 HTTP 200 에 `ok:false` 로 실패를 알려도 잡아내는가 (`src/lib/telegram.test.ts`)
