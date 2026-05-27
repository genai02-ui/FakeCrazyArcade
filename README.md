# Bubble Pang Arena

오리지널 물풍선 격자 전투 게임 프로토타입입니다. 넥슨의 캐릭터, 이름, 맵, 이미지, 사운드는 포함하지 않고, 장르적 규칙과 캐주얼 아케이드 분위기를 참고해 새 자산과 이름으로 구현했습니다.

## 실행

Codex 번들 Node를 사용하는 경우:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.mjs
```

일반 Node.js가 설치된 환경에서는:

```powershell
npm run dev
```

그 후 브라우저에서 엽니다.

```text
http://localhost:4173
```

## 기능

- 개인플레이: 플레이어 1명과 AI 적 3명이 전투합니다.
- 멀티플레이: 같은 서버 주소를 여러 브라우저/탭에서 열고 `멀티플레이` -> `서버 연결`을 누르면 최대 4명까지 접속합니다.
- 조작: 방향키/WASD 이동, Space 물풍선 설치.
- 바늘: 갇힌 상태에서 Ctrl을 누르면 1회 탈출합니다. 적 AI도 바늘을 1회 사용합니다.
- 규칙: 물풍선은 일정 시간 후 십자형으로 폭발하고, 맞은 캐릭터는 물방울에 갇힙니다. 시간이 지나거나 상대가 닿으면 탈락합니다.
- 아이템: 물풍선 수, 사거리, 이동속도 증가.
- AI: 맵 경로, 플레이어 위치, 물풍선 위치, 예상 폭발 범위를 계산하고, 물풍선을 놓기 전에 탈출 가능한 안전 경로가 있는지 확인합니다.
- 사운드: 물풍선 설치, 폭발, 아이템 획득, UI 클릭 효과음이 들어갑니다.
- 에셋: `public/assets` 아래에 CC0 그래픽/사운드 에셋을 내려받아 두었습니다. 출처는 `public/assets/ASSET_CREDITS.md`에 정리했습니다.
- 캐릭터: `public/assets/generated-characters`에 플레이어/적 4방향 캐릭터 시트를 생성했고, WASD/방향키 입력에 따라 앞/뒤/좌/우 이미지가 바뀝니다.
- 이동 연출: 판정은 격자 기반으로 유지하고, 화면 렌더링은 보간해서 더 자연스럽게 움직입니다.

## 구조

- `server.mjs`: 정적 파일 서버와 WebSocket 멀티플레이 서버.
- `src/gameCore.mjs`: 맵, 이동, 물풍선, 폭발, 아이템, AI, 승패 판정.
- `public/app.mjs`: Canvas 렌더링, 개인플레이 루프, 멀티플레이 클라이언트.
- `public/styles.css`: 게임 UI 스타일.
