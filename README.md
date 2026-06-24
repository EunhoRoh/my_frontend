# 🌱 성령의 나무 (Holy Spirit Tree)

선생님이 학생에게 **달란트**를 주면 학생의 **개인 나무**가 자라고, 학생이 그 달란트를
**공동체 나무**에 기부하면 모두의 나무가 함께 자라는 풀스택 웹앱입니다.

- **프론트엔드:** React 19 + Vite + Tailwind CSS 4
- **백엔드:** Django 6 + Django REST Framework (토큰 인증)
- **DB:** 개발은 SQLite, 배포는 PostgreSQL

## 역할

| 역할 | 할 수 있는 것 |
|------|---------------|
| 👦 학생 | 내 개인 나무 보기 · 받은 달란트 타임라인 · **공동체 나무에 기부** |
| 🧑‍🏫 선생님 | 배정된 학생 목록 · **달란트 지급(+칭찬 사유)** |
| 🛡️ 관리자 | 학생/선생님 목록 · 선생님↔학생 배정 · 권한 변경 · 통계 |

회원가입은 누구나 **이름 + 비밀번호**로 하며 기본 역할은 *학생*입니다.
선생님·관리자 권한과 학생 배정은 관리자가 지정합니다.

---

## 로컬 실행

### 1) 백엔드 (Django)

```bash
cd backend

# 가상환경 (이미 ../backend_venv 가 있다면 그대로 사용)
python -m venv ../backend_venv
../backend_venv/Scripts/activate        # Windows
# source ../backend_venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo               # 데모 계정 + 샘플 데이터 (선택)
python manage.py runserver 127.0.0.1:8000
```

API는 `http://127.0.0.1:8000/api/`, Django 관리자는 `http://127.0.0.1:8000/admin/` 입니다.

**데모 계정** (`seed_demo` 실행 시):

| 역할 | 이름 | 비밀번호 |
|------|------|----------|
| 관리자 | `관리자` | `admin1234` |
| 선생님 | `김선생`, `이선생`, `박선생` | `teacher1234` |
| 학생 | `학생01` ~ `학생30` | `student1234` |

### 2) 프론트엔드 (React)

```bash
npm install
npm run dev      # http://localhost:5173
```

`.env.development` 에 API 주소가 들어 있습니다 (`VITE_API_URL=http://127.0.0.1:8000/api`).

---

## 무료 배포 가이드

> 각자 폰 브라우저로 접속하는 30명 규모라면 아래 무료 조합으로 충분합니다.
> **프론트는 Vercel, 백엔드는 Render**로 나눠 올립니다. (Vercel은 정적 프론트에 최적,
> 항상 떠 있어야 하는 Django는 Render/PythonAnywhere가 적합)

### A. 백엔드 → Render (무료)

1. 이 저장소를 GitHub에 올립니다.
2. [Render](https://render.com) → **New → Blueprint** → 저장소 선택.
   루트의 [`render.yaml`](render.yaml)이 **웹서비스 + 무료 PostgreSQL**을 자동 구성합니다.
3. 배포 후 환경변수 설정:
   - `CORS_ALLOWED_ORIGINS` = 프론트 주소 (예: `https://your-app.vercel.app`)
   - `CSRF_TRUSTED_ORIGINS` = 동일
4. 첫 관리자 만들기 — Render 셸에서:
   ```bash
   python manage.py createsuperuser   # 또는 python manage.py seed_demo
   ```
   > 무료 플랜은 15분 미사용 시 잠들었다가 첫 요청에 ~30초 깨어납니다.

### B. 프론트엔드 → Vercel (무료)

1. [Vercel](https://vercel.com) → **Add New → Project** → 같은 저장소 선택.
2. Framework: **Vite** (자동 감지), Root Directory: 저장소 루트.
3. 환경변수 추가: `VITE_API_URL = https://holy-spirit-tree-api.onrender.com/api`
   (Render 백엔드 주소 + `/api`)
4. Deploy. 끝나면 나온 주소를 위 백엔드의 `CORS_ALLOWED_ORIGINS`에 넣어주세요.

### 대안
- 백엔드: **PythonAnywhere**(Django 무료 티어), Railway, Fly.io
- 프론트: **Cloudflare Pages**, Netlify
- DB: Render 내장 / **Neon** / **Supabase** (무료 PostgreSQL)

---

## 실시간(WebSocket)에 대하여

현재는 **폴링**(학생 화면 5초, 선생님/관리자 8초)으로 다른 사람의 변화를 반영합니다.
30명 규모엔 충분하고 무료 호스팅과도 잘 맞습니다. 발표회처럼 큰 화면에 즉시 반영이
필요해지면 그때 Django Channels로 WebSocket을 얹을 수 있습니다.

## 프로젝트 구조

```
my_frontend/
├── src/                  # React 프론트엔드
│   ├── api/client.js         # fetch 래퍼 (토큰 인증)
│   ├── auth/                 # AuthProvider · useAuth
│   ├── hooks/usePolling.js   # 주기적 새로고침
│   ├── components/           # TreeCharacter · CommunityTree · Celebration · AppHeader
│   ├── constants/tree.js     # 나무 단계/이미지
│   └── pages/                # Login · Student · Teacher · Admin
└── backend/              # Django 백엔드
    ├── config/               # settings · urls · wsgi
    └── core/                 # models · serializers · views · permissions · admin
        └── management/commands/seed_demo.py
```

## API 요약

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| POST | `/api/auth/register/` | 공개 | 회원가입(학생) |
| POST | `/api/auth/login/` | 공개 | 로그인 → 토큰 |
| POST | `/api/auth/logout/` | 인증 | 토큰 폐기 |
| GET | `/api/me/` | 인증 | 내 정보 |
| GET | `/api/community/` | 인증 | 공동체 나무 현황 |
| GET | `/api/student/dashboard/` | 학생 | 개인 나무·타임라인 |
| POST | `/api/student/donate/` | 학생 | 공동체 나무에 기부 |
| GET | `/api/teacher/students/` | 선생님 | 담당 학생 목록 |
| POST | `/api/teacher/grant/` | 선생님 | 달란트 지급 |
| GET | `/api/admin/users/` | 관리자 | 학생/선생님 목록 |
| POST | `/api/admin/assign/` | 관리자 | 학생-선생님 배정 |
| POST | `/api/admin/set-role/` | 관리자 | 역할 변경 |
| GET | `/api/admin/stats/` | 관리자 | 통계 |
