"""달란트 결산 내보내기 — 학생별 받은/기부 달란트와 기부 횟수를 CSV·Markdown으로 저장.

운영 DB(Neon)에 직접 붙어 집계한다. Django 없이 psycopg만 쓰므로
`manage.py` 환경이 없어도 로컬에서 바로 돌릴 수 있다.

사용법 (PowerShell):
    $env:DATABASE_URL = "postgresql://...neon.tech/neondb?sslmode=require"
    backend_venv\\Scripts\\python.exe scripts\\export_talent_summary.py

결과: reports/<날짜>_달란트_결산.{csv,md}

주의: DATABASE_URL은 절대 저장소에 커밋하지 말 것. 환경변수로만 전달한다.
"""

import csv
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg

KST = timezone(timedelta(hours=9), 'KST')
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'reports'

# 학생 1명 = 1행. 받은/기부를 각각 서브쿼리로 뽑아 조인해야 한다.
# 두 집계를 한 쿼리에서 JOIN + SUM 하면 행이 곱해져 합계가 부풀어 오른다.
STUDENT_SQL = """
SELECT u.username,
       COALESCE(g.received, 0)  AS received,
       COALESCE(g.gcnt, 0)      AS grant_count,
       COALESCE(d.donated, 0)   AS donated,
       COALESCE(d.dcnt, 0)      AS donation_count,
       COALESCE(g.received, 0) - COALESCE(d.donated, 0) AS balance,
       t.username               AS teacher
FROM core_user u
LEFT JOIN (SELECT student_id, SUM(amount) AS received, COUNT(*) AS gcnt
           FROM core_talentgrant GROUP BY student_id) g ON g.student_id = u.id
LEFT JOIN (SELECT student_id, SUM(amount) AS donated, COUNT(*) AS dcnt
           FROM core_donation GROUP BY student_id) d ON d.student_id = u.id
LEFT JOIN core_user t ON t.id = u.teacher_id
WHERE u.role = 'student'
ORDER BY donated DESC, received DESC, u.username
"""

DONATION_SQL = """
SELECT d.created_at, u.username, d.amount, d.message
FROM core_donation d JOIN core_user u ON u.id = d.student_id
ORDER BY d.created_at DESC
"""

TEACHER_SQL = """
SELECT t.username, COUNT(g.id) AS grants, COALESCE(SUM(g.amount), 0) AS talent
FROM core_user t
LEFT JOIN core_talentgrant g ON g.teacher_id = t.id
WHERE t.role = 'teacher'
GROUP BY t.username
ORDER BY talent DESC, grants DESC, t.username
"""


def kst(dt):
    """DB는 UTC로 저장한다. 결산 표기는 한국시간 기준."""
    return dt.astimezone(KST).strftime('%Y-%m-%d %H:%M')


def main():
    url = os.environ.get('DATABASE_URL')
    if not url:
        sys.exit('DATABASE_URL 환경변수가 없습니다. Neon connection string을 넣어 주세요.')

    with psycopg.connect(url) as conn:
        students = conn.execute(STUDENT_SQL).fetchall()
        donations = conn.execute(DONATION_SQL).fetchall()
        teachers = conn.execute(TEACHER_SQL).fetchall()

    OUT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(KST).strftime('%Y-%m-%d')
    csv_path = OUT_DIR / f'{stamp}_달란트_결산.csv'
    md_path = OUT_DIR / f'{stamp}_달란트_결산.md'

    # Excel에서 바로 열 수 있게 BOM 포함 UTF-8.
    with csv_path.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['이름', '받은 달란트', '지급 횟수', '기부 달란트', '기부 횟수',
                    '남은 달란트', '담당 선생님'])
        for name, recv, gcnt, don, dcnt, bal, teacher in students:
            w.writerow([name, recv, gcnt, don, dcnt, bal, teacher or ''])

    total_recv = sum(r[1] for r in students)
    total_don = sum(r[3] for r in students)
    donors = sum(1 for r in students if r[3] > 0)

    lines = [
        f'# 달란트 결산 — {stamp} (한국시간 기준)',
        '',
        f'- 학생 **{len(students)}명** · 선생님 **{len(teachers)}명**',
        f'- 지급된 달란트 **{total_recv}** (지급 {sum(r[2] for r in students)}건)',
        f'- 기부된 달란트 **{total_don}** (기부 {len(donations)}건 · 기부한 학생 **{donors}명**)',
        f'- 학생들이 아직 들고 있는 달란트 **{total_recv - total_don}**',
        '',
        '## 학생별 (기부 달란트 많은 순)',
        '',
        '| 이름 | 받은 달란트 | 지급 횟수 | 기부 달란트 | 기부 횟수 | 남은 달란트 | 담당 선생님 |',
        '|---|---:|---:|---:|---:|---:|---|',
    ]
    for name, recv, gcnt, don, dcnt, bal, teacher in students:
        lines.append(f'| {name} | {recv} | {gcnt} | {don} | {dcnt} | {bal} | {teacher or "–"} |')

    lines += ['', f'## 기부 내역 전체 ({len(donations)}건 · 최신순)', '',
              '| 시각(KST) | 이름 | 달란트 | 메시지 |', '|---|---|---:|---|']
    for created, name, amount, message in donations:
        lines.append(f'| {kst(created)} | {name} | {amount} | {message or ""} |')

    lines += ['', '## 선생님별 지급', '',
              '| 선생님 | 지급 횟수 | 지급 달란트 |', '|---|---:|---:|']
    for name, grants, talent in teachers:
        lines.append(f'| {name} | {grants} | {talent} |')

    md_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'저장 완료:\n  {csv_path}\n  {md_path}')


if __name__ == '__main__':
    main()
